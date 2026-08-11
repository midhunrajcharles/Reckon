import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeeperHubConfig } from "./config";
import {
  KeeperHubAuthError,
  KeeperHubCloudflareBlockedError,
  KeeperHubIdempotencyConflictError,
  KeeperHubInsufficientScopeError,
  KeeperHubRateLimitError,
  KeeperHubSimulationRevertError,
  KeeperHubWalletNotConfiguredError,
} from "./errors";
import { keeperHubFetch } from "./http";

const config: KeeperHubConfig = {
  apiKey: "kh_test_key",
  baseUrl: "https://api.keeperhub.example",
  userAgent: "reckon-hackathon-agent/0.1",
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keeperHubFetch", () => {
  it("sends Authorization: Bearer <key>, never X-API-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await keeperHubFetch(config, "/api/keys");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer kh_test_key");
    expect(headers["X-API-Key"]).toBeUndefined();
  });

  it("sends the configured User-Agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await keeperHubFetch(config, "/api/keys");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("reckon-hackathon-agent/0.1");
  });

  it("sends Idempotency-Key only when one is supplied", async () => {
    // A fresh Response per call — one body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await keeperHubFetch(config, "/api/execute/transfer", { method: "POST", body: {}, idempotencyKey: "abc123" });
    await keeperHubFetch(config, "/api/execute/transfer", { method: "POST", body: {} });

    const headersOf = (call: number) =>
      (fetchMock.mock.calls[call] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headersOf(0)["Idempotency-Key"]).toBe("abc123");
    expect(headersOf(1)["Idempotency-Key"]).toBeUndefined();
  });

  it("returns data + meta on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { valid: true })));

    const { data, meta } = await keeperHubFetch(config, "/api/keys");

    expect(data).toEqual({ valid: true });
    expect(meta.status).toBe(200);
  });

  it("treats a Cloudflare-shaped 403 (ray_id) as KeeperHubCloudflareBlockedError, not a KeeperHub auth failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { ray_id: "abc123", cloudflare_error: true }, {})),
    );

    await expect(keeperHubFetch(config, "/api/keys")).rejects.toThrow(KeeperHubCloudflareBlockedError);
  });

  it("treats a real KeeperHub 403 insufficient_scope as a distinct typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "insufficient_scope" })));

    await expect(keeperHubFetch(config, "/api/keys")).rejects.toThrow(KeeperHubInsufficientScopeError);
  });

  it("treats 401 as KeeperHubAuthError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

    await expect(keeperHubFetch(config, "/api/keys")).rejects.toThrow(KeeperHubAuthError);
  });

  it("decodes a 400 wouldRevert as KeeperHubSimulationRevertError, preserving revertReason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { wouldRevert: true, revertReason: "insufficient balance" })),
    );

    const err = await keeperHubFetch(config, "/api/execute/transfer", { method: "POST", body: {} }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(KeeperHubSimulationRevertError);
    expect((err as InstanceType<typeof KeeperHubSimulationRevertError>).revertReason).toBe("insufficient balance");
  });

  it("does not misclassify a plain 400 (no wouldRevert) as a simulation revert", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { message: "bad request" })));

    const err = await keeperHubFetch(config, "/api/execute/transfer", { method: "POST", body: {} }).catch(
      (e) => e,
    );

    expect(err).not.toBeInstanceOf(KeeperHubSimulationRevertError);
  });

  it("treats 422 WALLET_NOT_CONFIGURED as a typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { code: "WALLET_NOT_CONFIGURED" })));

    await expect(keeperHubFetch(config, "/api/user")).rejects.toThrow(KeeperHubWalletNotConfiguredError);
  });

  it("parses Retry-After on 429 and exposes it on the typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "12" })));

    const err = await keeperHubFetch(config, "/api/keys").catch((e) => e);

    expect(err).toBeInstanceOf(KeeperHubRateLimitError);
    expect((err as InstanceType<typeof KeeperHubRateLimitError>).retryAfterSeconds).toBe(12);
  });

  it("parses X-Poll-Interval-Hint: 0 as terminal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { status: "mined" }, { "X-Poll-Interval-Hint": "0" })));

    const { meta } = await keeperHubFetch(config, "/api/execute/abc/status");

    expect(meta.pollIntervalHintSeconds).toBe(0);
    expect(meta.pollIntervalIsTerminal).toBe(true);
  });

  it("parses a non-zero X-Poll-Interval-Hint as not terminal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { status: "pending" }, { "X-Poll-Interval-Hint": "5" })));

    const { meta } = await keeperHubFetch(config, "/api/execute/abc/status");

    expect(meta.pollIntervalIsTerminal).toBe(false);
  });

  it("treats 409 idempotency_conflict as a typed error carrying originalExecutionId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, { code: "idempotency_conflict", originalExecutionId: "exec_123" }),
      ),
    );

    const err = await keeperHubFetch(config, "/api/execute/transfer", { method: "POST", body: {} }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(KeeperHubIdempotencyConflictError);
    expect((err as InstanceType<typeof KeeperHubIdempotencyConflictError>).originalExecutionId).toBe("exec_123");
  });
});
