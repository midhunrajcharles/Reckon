/**
 * Gate 2 proof, one command:
 *
 *   pnpm gate-2 --execute
 *
 * 1. Runs a real zero-value self-transfer intent end to end, with the chaos
 *    injection active: the platform's real answer is overridden to "failed"
 *    AFTER the (single) broadcast, forcing the known reported-failure bug.
 * 2. The critique agent verifies independently, finds the mined receipt,
 *    writes the discrepancy row, and blocks the intent.
 * 3. Attempts the SAME intent again and proves the ledger refuses:
 *    RetryBlockedError, no second transaction.
 *
 * Without --execute it stops before any broadcast.
 */
import "../env";

import { KeeperHubClient } from "lib";
import { getIntent } from "db";
import { runIntentOnce, RetryBlockedError } from "../executor";

async function main() {
  if (!process.argv.includes("--execute")) {
    console.log("Gate 2 involves ONE real broadcast. Re-run with --execute after explicit go-ahead.");
    return;
  }

  const client = new KeeperHubClient();
  const walletAddress = await client.waitForOrgWallet();
  const taskId = `gate2-${Date.now()}`;

  console.log(`Org wallet: ${walletAddress}`);
  console.log(`Task: ${taskId} — zero-value self-transfer, chaos: inject reported "failed"\n`);

  const input = {
    taskId,
    chainId: 84532,
    recipientAddress: walletAddress,
    amount: "0",
    injectReportedStatus: "failed",
  };

  console.log("── Attempt 1: broadcast + injected failure report ──");
  const outcome = await runIntentOnce(client, input);
  console.log(`executionId:     ${outcome.executionId}`);
  console.log(`transactionHash: ${outcome.transactionHash}`);
  console.log(`verdict:         ${outcome.verdict.action}${"kind" in outcome.verdict ? ` (${outcome.verdict.kind})` : ""}`);
  if ("detail" in outcome.verdict) console.log(`detail:          ${outcome.verdict.detail}`);

  if (outcome.verdict.action !== "block") {
    console.error("\nGATE 2 FAILED: the forced mismatch did not produce a block verdict. Stopping.");
    process.exitCode = 1;
    return;
  }

  console.log("\n── Attempt 2: same intent again — the ledger must refuse ──");
  try {
    await runIntentOnce(client, { ...input, injectReportedStatus: undefined, trigger: "retry" });
    console.error("\nGATE 2 FAILED: a second attempt went through — the retry was NOT blocked. Stopping.");
    process.exitCode = 1;
    return;
  } catch (err) {
    if (!(err instanceof RetryBlockedError)) throw err;
    console.log(`RetryBlockedError: ${err.message}`);
  }

  const intent = await getIntent(outcome.intent.id);
  console.log(`\nIntent status:  ${intent?.status} (retryBlocked=${intent?.retryBlocked})`);
  console.log(`Blocked reason: ${intent?.blockedReason}`);
  console.log("\nGATE 2 PASSED: one transaction, one discrepancy row, zero double-spends.");
}

await main();
