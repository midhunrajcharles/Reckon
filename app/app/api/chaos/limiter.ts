/**
 * Abuse control for the chaos routes, which broadcast real (zero-value,
 * sponsored) transactions. Defence in depth:
 *
 * 1. Structural cap — the routes accept NO client input: amount is "0",
 *    recipient is the org wallet, chain is Base Sepolia, all fixed
 *    server-side. The worst an abuser can trigger is a zero-value
 *    self-transfer on a testnet.
 * 2. Single-flight — one scenario at a time per server instance.
 * 3. Cooldown — a fresh scenario can start at most once per COOLDOWN_MS.
 *
 * In-memory, so per-instance on serverless: bursts within one instance are
 * throttled; the structural cap is what makes cross-instance abuse harmless.
 */
const COOLDOWN_MS = 30_000;

let running = false;
let lastStart = 0;

export function acquireChaosSlot(): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  if (running) return { ok: false, retryAfterSeconds: 30 };
  const wait = lastStart + COOLDOWN_MS - now;
  if (wait > 0) return { ok: false, retryAfterSeconds: Math.ceil(wait / 1000) };
  running = true;
  lastStart = now;
  return { ok: true };
}

export function releaseChaosSlot(): void {
  running = false;
}

export function chaosThrottledResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: `A scenario is already running or cooling down. Try again in ${retryAfterSeconds}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
