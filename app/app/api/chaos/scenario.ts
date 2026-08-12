import { KeeperHubClient } from "lib";
import { publicError } from "../public-error";
import { acquireChaosSlot, chaosThrottledResponse, releaseChaosSlot } from "./limiter";

/**
 * Shared scaffold for every chaos route: throttle, client, org wallet, error
 * mapping, and — critically — the `finally` that releases the limiter slot.
 * Forgetting that release would wedge the demo, so it lives here once rather
 * than being per-route discipline.
 */
export interface ScenarioContext {
  client: KeeperHubClient;
  walletAddress: `0x${string}`;
  /** Fixed server-side; routes accept no client input. */
  chainId: number;
  amount: "0";
}

let walletPromise: Promise<`0x${string}`> | undefined;

/** The org wallet is immutable once provisioned — resolve it once per process. */
function orgWallet(client: KeeperHubClient): Promise<`0x${string}`> {
  walletPromise ??= client.waitForOrgWallet().catch((err) => {
    walletPromise = undefined; // let a later request retry
    throw err;
  });
  return walletPromise;
}

export async function withChaosScenario(
  run: (ctx: ScenarioContext) => Promise<unknown>,
): Promise<Response> {
  const slot = acquireChaosSlot();
  if (!slot.ok) return chaosThrottledResponse(slot.retryAfterSeconds);
  try {
    const client = new KeeperHubClient();
    const walletAddress = await orgWallet(client);
    const body = await run({ client, walletAddress, chainId: 84532, amount: "0" });
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: publicError("api/chaos", err) }, { status: 500 });
  } finally {
    releaseChaosSlot();
  }
}
