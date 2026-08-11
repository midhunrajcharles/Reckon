/**
 * Base for failures that provably happened BEFORE anything could reach the
 * network: bad config, or a request body our own schema rejected.
 *
 * Everything else — any HTTP status, a transport error, a timeout — is
 * ambiguous: the request may have broadcast before the failure surfaced.
 * Callers must fail CLOSED on ambiguity and let the chain read decide, rather
 * than assume nothing happened and free the intent for a retry.
 *
 * Membership is structural, by subclass, so new pre-broadcast modes opt in
 * deliberately. Note what must NOT extend this: a *response*-side parse
 * failure (e.g. GET /api/user) happens after the request went out, and is
 * therefore ambiguous like any other post-send failure.
 */
export abstract class KeeperHubPreBroadcastError extends Error {}

export class KeeperHubConfigError extends KeeperHubPreBroadcastError {
  constructor(message: string) {
    super(message);
    this.name = "KeeperHubConfigError";
  }
}

/** Our own wire schema rejected the request body — nothing was sent. */
export class KeeperHubWireValidationError extends KeeperHubPreBroadcastError {
  constructor(endpoint: string, cause: unknown) {
    super(`Request body for ${endpoint} failed wire validation before sending: ${(cause as Error).message}`, {
      cause,
    });
    this.name = "KeeperHubWireValidationError";
  }
}

export function isPreBroadcastError(err: unknown): err is KeeperHubPreBroadcastError {
  return err instanceof KeeperHubPreBroadcastError;
}

/**
 * A 403 that is actually Cloudflare, not KeeperHub — happens when the
 * User-Agent header is missing/generic. Body carries `ray_id` and/or
 * `cloudflare_error` and must never be treated as a KeeperHub auth failure.
 */
export class KeeperHubCloudflareBlockedError extends Error {
  readonly rayId?: string;
  readonly status: number;

  constructor(rayId: string | undefined, status: number) {
    super(
      `Blocked by Cloudflare before reaching KeeperHub (ray_id=${rayId ?? "unknown"}, status=${status}). ` +
        "This is not a KeeperHub auth failure — check that a descriptive User-Agent header is set.",
    );
    this.name = "KeeperHubCloudflareBlockedError";
    this.rayId = rayId;
    this.status = status;
  }
}

export class KeeperHubHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(status: number, code: string | undefined, body: unknown, message?: string) {
    super(message ?? `KeeperHub API error: ${httpSummary(status, code)}`);
    this.name = "KeeperHubHttpError";
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /**
   * Status and code only. Safe to show a user or put in an HTTP response —
   * unlike `message` and `body`, it can carry no upstream or infrastructure
   * detail.
   */
  get summary(): string {
    return httpSummary(this.status, this.code);
  }
}

function httpSummary(status: number, code: string | undefined): string {
  return `HTTP ${status}${code ? ` (${code})` : ""}`;
}

export class KeeperHubAuthError extends KeeperHubHttpError {
  constructor(status: number, code: string | undefined, body: unknown) {
    super(
      status,
      code,
      body,
      "Authentication failed (401). Confirm KEEPERHUB_API_KEY is set and sent as " +
        '"Authorization: Bearer <key>" — not "X-API-Key" (stale docs).',
    );
    this.name = "KeeperHubAuthError";
  }
}

export class KeeperHubInsufficientScopeError extends KeeperHubHttpError {
  constructor(status: number, code: string | undefined, body: unknown) {
    super(status, code, body, "KeeperHub API key is missing a required scope (403 insufficient_scope).");
    this.name = "KeeperHubInsufficientScopeError";
  }
}

export class KeeperHubWalletNotConfiguredError extends KeeperHubHttpError {
  constructor(status: number, code: string | undefined, body: unknown) {
    super(
      status,
      code,
      body,
      "Org wallet is not configured yet (422 WALLET_NOT_CONFIGURED). Provisioning is async — poll GET /api/user.",
    );
    this.name = "KeeperHubWalletNotConfiguredError";
  }
}

export class KeeperHubRateLimitError extends KeeperHubHttpError {
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string | undefined, body: unknown, retryAfterSeconds: number | undefined) {
    super(
      status,
      code,
      body,
      `Rate limited (429)${retryAfterSeconds !== undefined ? ` — honour Retry-After: ${retryAfterSeconds}s` : ""}.`,
    );
    this.name = "KeeperHubRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Simulation reverts arrive as HTTP 400 with `wouldRevert: true` — a designed
 * response, not a transport failure. A generic "non-2xx = failed" wrapper
 * would discard `revertReason`; this type exists so nothing does that.
 */
export class KeeperHubSimulationRevertError extends KeeperHubHttpError {
  readonly revertReason?: string;

  constructor(status: number, body: unknown, revertReason: string | undefined) {
    super(status, "wouldRevert", body, `Simulation would revert${revertReason ? `: ${revertReason}` : ""}.`);
    this.name = "KeeperHubSimulationRevertError";
    this.revertReason = revertReason;
  }
}

export class KeeperHubIdempotencyConflictError extends KeeperHubHttpError {
  readonly originalExecutionId?: string;

  constructor(status: number, code: string | undefined, body: unknown, originalExecutionId: string | undefined) {
    super(
      status,
      code,
      body,
      `Idempotency conflict (409 ${code ?? "idempotency_conflict"})` +
        (originalExecutionId ? ` — original execution: ${originalExecutionId}` : ""),
    );
    this.name = "KeeperHubIdempotencyConflictError";
    this.originalExecutionId = originalExecutionId;
  }
}
