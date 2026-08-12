import type { TapeRow as DbTapeRow } from "db";

/**
 * The wire shape of /api/tape: the db's row types after JSON serialisation
 * (Dates become strings). Derived, not hand-copied — a schema change that
 * the UI doesn't handle becomes a type error instead of a silent blank cell.
 * Type-only imports are erased at compile time, so drizzle never reaches the
 * client bundle.
 */
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type TapeAttempt = Serialized<DbTapeRow["attempt"]>;
export type TapeIntent = Serialized<DbTapeRow["intent"]>;
export type TapeReceipt = Serialized<NonNullable<DbTapeRow["receipt"]>>;
export type TapeDiscrepancy = Serialized<NonNullable<DbTapeRow["discrepancy"]>>;

export interface TapeRow {
  attempt: TapeAttempt;
  intent: TapeIntent;
  receipt: TapeReceipt | null;
  discrepancy: TapeDiscrepancy | null;
}

export interface TapeSnapshot {
  rows: TapeRow[];
  counters: { settled: number; reconciled: number; discrepanciesCaught: number };
}

export type Verdict =
  | "settled"
  | "blocked"
  | "reverted"
  | "unverified"
  | "no_broadcast"
  | "needs_review"
  | "pending";

/** One verdict per row; a discrepancy overrules everything else. */
export function rowVerdict(row: TapeRow): Verdict {
  if (row.discrepancy) return "blocked";
  if (row.intent.status === "needs_review") return "needs_review";
  switch (row.attempt.verifiedStatus) {
    case "success":
      return "settled";
    case "reverted":
      return "reverted";
    case "not_found":
      // No hash was ever reported: nothing went out — a refused bid, not a
      // fail-closed parking. Distinct so escalation stories read cold.
      return row.attempt.reportedTxHash === null ? "no_broadcast" : "unverified";
    case "timeout":
      return "unverified";
    default:
      return "pending";
  }
}

/** Returns undefined when the chain isn't in lib's registry — callers render text, not a dead link. */
export { explorerTxUrl } from "lib";

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
