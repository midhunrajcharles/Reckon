import type { Intent } from "db";
import {
  bumpReverifyCount,
  latestAttempt,
  listUnverifiedIntents,
  markNeedsReview,
} from "db";
import { makeIndependentClient } from "./chain";
import { critiqueAttempt, type CritiqueLedger } from "./critique";
import type { ObserveOptions, ReceiptReader } from "./observe";

/** Re-checks stop after this many passes; then a human owns the intent. */
export const MAX_REVERIFIES = 5;

export interface ReverifyDeps {
  listUnverifiedIntents: typeof listUnverifiedIntents;
  latestAttempt: typeof latestAttempt;
  bumpReverifyCount: typeof bumpReverifyCount;
  markNeedsReview: typeof markNeedsReview;
  readerFor: (chainId: number) => ReceiptReader;
  critiqueLedger?: CritiqueLedger;
  observe?: ObserveOptions;
  maxReverifies?: number;
}

export interface ReverifyResult {
  intentId: string;
  taskId: string;
  outcome: "resolved" | "still_unverified" | "needs_review" | "skipped_no_attempt" | "failed";
  verdictAction?: string;
  reverifyCount?: number;
  /** Set on `failed`: this intent errored, the rest of the pass continued. */
  error?: string;
}

const realDeps: Omit<ReverifyDeps, "critiqueLedger" | "observe" | "maxReverifies"> = {
  listUnverifiedIntents,
  latestAttempt,
  bumpReverifyCount,
  markNeedsReview,
  readerFor: (chainId) => makeIndependentClient(chainId),
};

/**
 * One pass over parked intents. Each gets a fresh independent read via the
 * normal critique path — so a late receipt settles, a late mismatch still
 * blocks, and only an undecidable chain keeps the intent parked. After
 * MAX_REVERIFIES undecidable passes the intent escalates to `needs_review`:
 * terminal, visible on the tape, never guessed past.
 */
export async function runReverifyPass(overrides: Partial<ReverifyDeps> = {}): Promise<ReverifyResult[]> {
  const deps: ReverifyDeps = { ...realDeps, ...overrides };
  const results: ReverifyResult[] = [];

  const parked: Intent[] = await deps.listUnverifiedIntents();
  for (const intent of parked) {
    try {
      results.push(await reverifyOne(intent, deps));
    } catch (err) {
      // Isolation: one intent's RPC blip or vanished row must not abort the
      // pass and starve every intent behind it. It stays parked and comes
      // round again on the next pass.
      results.push({
        intentId: intent.id,
        taskId: intent.taskId,
        outcome: "failed",
        error: (err as Error).message,
      });
    }
  }

  return results;
}

/** One parked intent: a fresh independent read, then settle, block, or park again. */
async function reverifyOne(intent: Intent, deps: ReverifyDeps): Promise<ReverifyResult> {
  const max = deps.maxReverifies ?? MAX_REVERIFIES;
  const base = { intentId: intent.id, taskId: intent.taskId };

  const attempt = await deps.latestAttempt(intent.id);
  if (!attempt) return { ...base, outcome: "skipped_no_attempt" };

  // timeoutMs 0: one receipt read + one pending-vs-gone check. The worker
  // interval is the retry clock — the observer must not have its own.
  const verdict = await critiqueAttempt(attempt, deps.readerFor(intent.chainId), {
    timeoutMs: 0,
    ...deps.observe,
    ledger: deps.critiqueLedger,
  });

  // The chain finally answered — settled, blocked, or genuinely failed.
  if (verdict.action !== "reverify") {
    return { ...base, outcome: "resolved", verdictAction: verdict.action };
  }

  const count = await deps.bumpReverifyCount(attempt.id);
  if (count < max) return { ...base, outcome: "still_unverified", reverifyCount: count };

  await deps.markNeedsReview(intent.id, `re-verification exhausted after ${count} passes: ${verdict.detail}`);
  return { ...base, outcome: "needs_review", reverifyCount: count };
}
