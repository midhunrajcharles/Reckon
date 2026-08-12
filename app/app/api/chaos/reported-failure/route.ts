import { runIntentOnce, RetryBlockedError } from "agent/executor";
import { withChaosScenario } from "../scenario";

export const dynamic = "force-dynamic";
// One real broadcast + polling + independent verification takes a while.
export const maxDuration = 120;

/**
 * Chaos scenario: the platform's answer is overridden to "failed" AFTER one
 * real broadcast. The critique agent finds the mined receipt, blocks the
 * intent, and the follow-up attempt is refused at the ledger. One
 * transaction, not two.
 */
export async function POST() {
  return withChaosScenario(async ({ client, walletAddress, chainId, amount }) => {
    const input = {
      taskId: `demo-failure-${Date.now()}`,
      chainId,
      recipientAddress: walletAddress,
      amount,
    };

    const outcome = await runIntentOnce(client, { ...input, injectReportedStatus: "failed" });
    if (outcome.verdict.action !== "block") {
      throw new Error(`Expected a block verdict, got ${outcome.verdict.action}`);
    }

    // Prove the refusal by actually trying again.
    let retryRefused = false;
    try {
      await runIntentOnce(client, input);
    } catch (err) {
      if (!(err instanceof RetryBlockedError)) throw err;
      retryRefused = true;
    }

    return {
      taskId: input.taskId,
      transactionHash: outcome.transactionHash,
      executionId: outcome.executionId,
      verdict: outcome.verdict,
      retryRefused,
    };
  });
}
