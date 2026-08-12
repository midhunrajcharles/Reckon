import { runGasSpikeScenario } from "agent/executor";
import { withChaosScenario } from "../scenario";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Chaos scenario: attempt #0's gas bid dies to an injected spike (labelled,
 * never broadcast); attempt #1 escalates the bid and settles for real.
 */
export async function POST() {
  return withChaosScenario(async ({ client, walletAddress, chainId, amount }) => {
    const outcome = await runGasSpikeScenario(client, {
      taskId: `demo-gas-${Date.now()}`,
      chainId,
      recipientAddress: walletAddress,
      amount,
    });

    return {
      taskId: outcome.recovery.intent.taskId,
      transactionHash: outcome.recovery.transactionHash,
      executionId: outcome.recovery.executionId,
      verdict: outcome.recovery.verdict,
    };
  });
}
