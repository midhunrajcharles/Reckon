import type { KeeperHubConfig } from "./config";
import {
  KeeperHubAuthError,
  KeeperHubCloudflareBlockedError,
  KeeperHubHttpError,
  KeeperHubIdempotencyConflictError,
  KeeperHubInsufficientScopeError,
  KeeperHubRateLimitError,
  KeeperHubSimulationRevertError,
  KeeperHubWalletNotConfiguredError,
} from "./errors";

export interface KeeperHubResponseMeta {
  status: number;
  retryAfterSeconds?: number;
  /** X-Poll-Interval-Hint, seconds. 0 means terminal — stop polling. */
  pollIntervalHintSeconds?: number;
  pollIntervalIsTerminal?: boolean;
}

export interface KeeperHubRawResponse<T> {
  data: T;
  meta: KeeperHubResponseMeta;
}

function isCloudflareErrorBody(body: unknown): body is { ray_id?: string; cloudflare_error?: unknown } {
  return typeof body === "object" && body !== null && ("ray_id" in body || "cloudflare_error" in body);
}

function readString(body: unknown, key: string): string | undefined {
  if (typeof body === "object" && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function readBool(body: unknown, key: string): boolean | undefined {
  if (typeof body === "object" && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "boolean" ? value : undefined;
  }
  return undefined;
}

function parseSecondsHeader(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export async function keeperHubFetch<T = unknown>(
  config: KeeperHubConfig,
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<KeeperHubRawResponse<T>> {
  const url = `${config.baseUrl}${path}`;
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "User-Agent": config.userAgent,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      // Confirmed live 2026-08-11: the HEADER is the transport. Two identical
      // executes sharing one key returned the same executionId and txHash with
      // idempotentReplay: true. The body field is silently ignored.
      ...(init.idempotencyKey !== undefined ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const retryAfterSeconds = parseSecondsHeader(response.headers.get("retry-after"));
  const pollIntervalHintSeconds = parseSecondsHeader(response.headers.get("x-poll-interval-hint"));

  const meta: KeeperHubResponseMeta = {
    status: response.status,
    retryAfterSeconds,
    pollIntervalHintSeconds,
    pollIntervalIsTerminal: pollIntervalHintSeconds === 0,
  };

  const text = await response.text();
  let body: unknown;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (response.ok) {
    return { data: body as T, meta };
  }

  // Cloudflare blocks arrive as JSON 403s that look like KeeperHub errors —
  // check for its shape before touching any KeeperHub-specific status logic.
  if (isCloudflareErrorBody(body)) {
    throw new KeeperHubCloudflareBlockedError(body.ray_id, response.status);
  }

  const code = readString(body, "code");

  // Designed 400, not a transport failure — must not be discarded by a
  // generic "non-2xx = failed" branch.
  if (response.status === 400 && readBool(body, "wouldRevert") === true) {
    throw new KeeperHubSimulationRevertError(response.status, body, readString(body, "revertReason"));
  }

  if (response.status === 401) {
    throw new KeeperHubAuthError(response.status, code, body);
  }

  if (response.status === 403 && code === "insufficient_scope") {
    throw new KeeperHubInsufficientScopeError(response.status, code, body);
  }

  if (response.status === 422 && code === "WALLET_NOT_CONFIGURED") {
    throw new KeeperHubWalletNotConfiguredError(response.status, code, body);
  }

  if (response.status === 429) {
    throw new KeeperHubRateLimitError(response.status, code, body, retryAfterSeconds);
  }

  if (response.status === 409 && (code === "idempotency_conflict" || code === "idempotency_in_progress")) {
    throw new KeeperHubIdempotencyConflictError(response.status, code, body, readString(body, "originalExecutionId"));
  }

  throw new KeeperHubHttpError(response.status, code, body);
}
