import { KeeperHubHttpError } from "lib";
import { RetryBlockedError } from "db";

/**
 * Error text safe to put in an HTTP response body. The real error is logged
 * server-side; the client gets a short summary.
 *
 * These routes are reachable on the public deployed URL, and raw `err.message`
 * carries infrastructure detail — the Neon driver puts connection host and
 * database name into connection failures, and upstream URLs show up in fetch
 * errors. Status and code are safe and diagnostic; bodies and messages are not.
 */
export function publicError(scope: string, err: unknown): string {
  console.error(`[${scope}]`, err);

  // Says which upstream failed and how, without echoing the response body.
  if (err instanceof KeeperHubHttpError) return `KeeperHub returned ${err.summary}.`;
  // The point of the demo, and it carries only our own ids — safe verbatim.
  if (err instanceof RetryBlockedError) return err.message;

  return "Internal error — details are in the server logs.";
}
