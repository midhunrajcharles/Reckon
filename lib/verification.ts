/**
 * The critique agent's decision core: reported status is a hypothesis, the
 * independently fetched receipt is the truth, and every ambiguous outcome
 * fails CLOSED. Pure logic — no I/O — so the whole matrix is testable.
 */

/** What the platform claims happened. */
export interface ReportedOutcome {
  status: string | null | undefined;
  transactionHash: string | null | undefined;
}

/** What our own RPC read actually found. */
export type ChainObservation =
  | { kind: "receipt"; status: "success" | "reverted" }
  /** The platform gave us no hash — there is nothing to verify against. */
  | { kind: "no_hash" }
  /** Hash known to us, chain has no trace of it within the deadline. */
  | { kind: "not_found" }
  /** RPC did not answer (or tx still pending) within the deadline. */
  | { kind: "timeout" };

export type ReconcileVerdict =
  /** Chain says mined+success. The only path to SETTLED. */
  | { action: "settle" }
  /** Genuine failure on both sides — a fresh attempt is allowed. */
  | { action: "retryable_failure"; detail: string }
  /** Could not confirm either way. Park as unverified, re-verify later, never settle, never retry. */
  | { action: "reverify"; detail: string }
  /** Reported and chain truth disagree: write the discrepancy row and block the retry. */
  | {
      action: "block";
      kind: "reported_failed_chain_success" | "reported_success_chain_reverted" | "reported_success_not_found";
      detail: string;
    };

const SUCCESS_STATUSES = new Set(["completed", "success", "succeeded", "confirmed", "executed"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "errored", "reverted", "cancelled", "canceled"]);

/**
 * Statuses the agent mints itself when the platform gave no usable answer.
 * They live here, beside the two sets, because their whole meaning is being
 * absent from both: each classifies as `unknown`, which is what makes the
 * attempt fail CLOSED instead of being freed for a re-broadcast. Adding any
 * of these to FAILURE_STATUSES would silently flip that. Locked by test.
 */
export const AGENT_STATUSES = {
  /** The submission threw ambiguously — a broadcast may or may not have happened. */
  submissionError: "submission_error",
  /** The status poll never reached terminal, or itself failed. */
  statusPollFailed: "status_poll_failed",
  /** KeeperHub reported the first submission still in flight. */
  inProgress: "in_progress",
  /** KeeperHub rejected the key as conflicting with an earlier payload. */
  idempotencyConflict: "idempotency_conflict",
} as const;

export type ReportedClass = "success" | "failure" | "unknown";

export function classifyReportedStatus(status: string | null | undefined): ReportedClass {
  if (!status) return "unknown";
  const s = status.trim().toLowerCase();
  if (SUCCESS_STATUSES.has(s)) return "success";
  if (FAILURE_STATUSES.has(s)) return "failure";
  return "unknown";
}

export function reconcile(reported: ReportedOutcome, chain: ChainObservation): ReconcileVerdict {
  const claim = classifyReportedStatus(reported.status);

  switch (chain.kind) {
    case "receipt":
      if (chain.status === "success") {
        if (claim === "failure") {
          // The known platform bug: a mined, successful tx reported as FAILED.
          // A naive agent retries here and pays twice. One transaction, not two.
          return {
            action: "block",
            kind: "reported_failed_chain_success",
            detail: `Platform reported "${reported.status}" but the chain holds a successful receipt for ${reported.transactionHash}. Retry blocked — retrying would double-spend.`,
          };
        }
        return { action: "settle" };
      }
      // Receipt says reverted.
      if (claim === "success") {
        return {
          action: "block",
          kind: "reported_success_chain_reverted",
          detail: `Platform reported "${reported.status}" but the receipt for ${reported.transactionHash} is a revert. Nothing settled — blocking until a human reconciles.`,
        };
      }
      return { action: "retryable_failure", detail: "Chain and platform agree the transaction reverted." };

    case "no_hash":
      if (claim === "failure") {
        // Nothing was broadcast as far as anyone claims — safe to try again.
        return { action: "retryable_failure", detail: "Reported failure with no transaction hash — nothing on chain to contradict it." };
      }
      // A success claim with no hash is unverifiable. Never settle on it.
      return { action: "reverify", detail: `Platform reported "${reported.status}" but provided no transaction hash — unverifiable, failing closed.` };

    case "not_found":
      if (claim === "success") {
        return {
          action: "block",
          kind: "reported_success_not_found",
          detail: `Platform reported "${reported.status}" for ${reported.transactionHash} but the chain has no trace of it. Failing closed and blocking.`,
        };
      }
      // Can't prove it never landed — fail closed, re-verify, do not re-broadcast.
      return { action: "reverify", detail: `No receipt found for ${reported.transactionHash} yet. Failing closed — re-verify before any retry.` };

    case "timeout":
      return { action: "reverify", detail: "Independent RPC read timed out. Failing closed — never settling on a timeout." };
  }
}
