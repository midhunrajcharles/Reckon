/**
 * The standing Reckon worker. Two independent loops in one process:
 *
 * - reverify: re-checks parked (unverified) intents. Fresh receipts settle or
 *   block through the normal critique path; undecidable chains escalate to
 *   needs_review after MAX_REVERIFIES passes.
 * - settle (opt-in, `--settle`): drives a real zero-value self-transfer through
 *   the full pipeline on an interval, so the ledger accumulates genuine
 *   quiet-agreement rows. Real broadcasts — never seeded, never simulated-only.
 */
import "./env";
import { BASE_SEPOLIA_CHAIN_ID, KeeperHubClient, sleep } from "lib";
import { runReverifyPass, MAX_REVERIFIES } from "./reverify";
import { describeSettlement, runSettlement } from "./settle";

const reverifyIntervalMs = Number(process.env.REVERIFY_INTERVAL_MS ?? 30_000);
const settleIntervalMs = Number(process.env.SETTLE_INTERVAL_MS ?? 150_000);
const settleChainId = Number(process.env.SETTLE_CHAIN_ID ?? BASE_SEPOLIA_CHAIN_ID);
const settleEnabled = process.argv.includes("--settle");

/** Runs `body` forever on a fixed interval; a thrown pass is logged, never fatal. */
async function every(label: string, intervalMs: number, body: () => Promise<void>): Promise<never> {
  for (;;) {
    try {
      await body();
    } catch (err) {
      console.error(`[${label}] pass failed: ${(err as Error).message}`);
    }
    await sleep(intervalMs);
  }
}

function reverifyLoop(): Promise<never> {
  return every("reverify", reverifyIntervalMs, async () => {
    for (const r of await runReverifyPass()) {
      console.log(
        `[reverify] ${r.taskId}: ${r.outcome}${r.verdictAction ? ` (${r.verdictAction})` : ""}${
          r.reverifyCount !== undefined ? ` (pass ${r.reverifyCount}/${MAX_REVERIFIES})` : ""
        }${r.error ? ` — ${r.error}` : ""}`,
      );
    }
  });
}

async function settleLoop(): Promise<never> {
  const client = new KeeperHubClient();
  // The org wallet, not the sign-in address — and it provisions asynchronously.
  const walletAddress = await client.waitForOrgWallet();
  console.log(`[settle] every ${settleIntervalMs}ms — chain ${settleChainId}, wallet ${walletAddress}`);

  return every("settle", settleIntervalMs, async () => {
    // The period belongs in taskId: without it every tick hashes to the same
    // idempotency key and replays inside KeeperHub's 24h window instead of
    // settling. (scheduledTaskId only goes down to hourly, too coarse here.)
    const taskId = `standing-${settleChainId}-${new Date().toISOString()}`;
    console.log(`[settle] ${describeSettlement(taskId, await runSettlement(client, walletAddress, taskId, settleChainId))}`);
  });
}

console.log(
  `reckon worker — reverify every ${reverifyIntervalMs}ms, escalate after ${MAX_REVERIFIES} passes` +
    (settleEnabled ? "" : " (standing settlements off; pass --settle to broadcast)"),
);

const loops = [reverifyLoop()];
if (settleEnabled) loops.push(settleLoop());
await Promise.all(loops);
