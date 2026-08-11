import { reconcile, type ReconcileVerdict } from "lib";
import type { Attempt, NewReceipt } from "db";
import {
  recordDiscrepancyAndBlock,
  recordNoBroadcastFailure,
  recordUnverified,
  recordVerified,
} from "db";
import { observeTransaction, type ObserveOptions, type ReceiptReader } from "./observe";

/** Ledger surface the critique agent writes through — injectable for tests. */
export interface CritiqueLedger {
  recordVerified: typeof recordVerified;
  recordUnverified: typeof recordUnverified;
  recordNoBroadcastFailure: typeof recordNoBroadcastFailure;
  recordDiscrepancyAndBlock: typeof recordDiscrepancyAndBlock;
}

const realLedger: CritiqueLedger = {
  recordVerified,
  recordUnverified,
  recordNoBroadcastFailure,
  recordDiscrepancyAndBlock,
};

function bigintsToStrings(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

function receiptRow(attempt: Attempt, raw: Record<string, unknown>): NewReceipt {
  const str = (k: string) => (raw[k] === undefined || raw[k] === null ? undefined : String(raw[k]));
  return {
    attemptId: attempt.id,
    txHash: str("transactionHash") ?? attempt.reportedTxHash ?? "",
    status: String(raw.status),
    blockNumber: str("blockNumber"),
    blockHash: str("blockHash"),
    fromAddress: str("from"),
    toAddress: str("to"),
    gasUsed: str("gasUsed"),
    raw: bigintsToStrings(raw),
  };
}

/**
 * The critique pass for one attempt: reported status in, independent chain
 * read, reconcile, and exactly one ledger outcome. Returns the verdict so
 * callers (executor, chaos panel, tests) can narrate it.
 */
export async function critiqueAttempt(
  attempt: Attempt,
  reader: ReceiptReader,
  opts: ObserveOptions & { ledger?: CritiqueLedger } = {},
): Promise<ReconcileVerdict> {
  const ledger = opts.ledger ?? realLedger;

  const { observation, receipt } = await observeTransaction(reader, attempt.reportedTxHash, opts);
  const verdict = reconcile(
    { status: attempt.reportedStatus, transactionHash: attempt.reportedTxHash },
    observation,
  );

  switch (verdict.action) {
    case "settle":
      await ledger.recordVerified(attempt.id, receiptRow(attempt, receipt!), "settled");
      break;
    case "retryable_failure":
      if (receipt) {
        await ledger.recordVerified(attempt.id, receiptRow(attempt, receipt), "reverted");
      } else {
        await ledger.recordNoBroadcastFailure(attempt.id);
      }
      break;
    case "reverify":
      await ledger.recordUnverified(attempt.id, observation.kind === "timeout" ? "timeout" : "not_found");
      break;
    case "block":
      await ledger.recordDiscrepancyAndBlock({
        intentId: attempt.intentId,
        attemptId: attempt.id,
        kind: verdict.kind,
        reportedStatus: attempt.reportedStatus ?? "unknown",
        verifiedStatus: observation.kind === "receipt" ? observation.status : "not_found",
        detail: verdict.detail,
        receipt: receipt ? receiptRow(attempt, receipt) : undefined,
      });
      break;
  }

  return verdict;
}
