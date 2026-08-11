import { BASE_SEPOLIA_CHAIN_ID, KeeperHubClient } from "lib";
import { runIntentOnce, type RunIntentOutcome } from "./executor";

/**
 * One clean zero-value self-transfer through the full pipeline — simulate,
 * broadcast, independent verification. The quiet-agreement row on the tape.
 *
 * Both drivers share this: the one-shot `pnpm settle` script and the standing
 * worker's interval loop. They are meant to produce identical tape rows, so
 * the recipe lives in one place.
 */
export async function runSettlement(
  client: KeeperHubClient,
  walletAddress: `0x${string}`,
  taskId: string,
  chainId: number = BASE_SEPOLIA_CHAIN_ID,
): Promise<RunIntentOutcome> {
  return runIntentOnce(client, {
    taskId,
    chainId,
    recipientAddress: walletAddress,
    amount: "0",
  });
}

/** The one-line summary both drivers log for a settlement. */
export function describeSettlement(taskId: string, outcome: RunIntentOutcome): string {
  return `${taskId}: verdict=${outcome.verdict.action} tx=${outcome.transactionHash ?? "—"} exec=${
    outcome.executionId ?? "—"
  }`;
}
