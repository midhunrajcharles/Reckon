import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "./client";
import {
  attempts,
  discrepancies,
  intents,
  receipts,
  type Attempt,
  type Discrepancy,
  type Intent,
  type NewAttempt,
  type NewIntent,
  type NewReceipt,
  type Receipt,
} from "./schema";

/** Thrown when the executor asks to attempt an intent whose retry is blocked. */
export class RetryBlockedError extends Error {
  constructor(
    public readonly intentId: string,
    public readonly reason: string | null,
  ) {
    super(`Retry blocked for intent ${intentId}: ${reason ?? "open discrepancy"}`);
    this.name = "RetryBlockedError";
  }
}

export async function createIntent(input: NewIntent): Promise<Intent> {
  const db = getDb();
  const [row] = await db.insert(intents).values(input).onConflictDoNothing().returning();
  if (row) return row;
  // taskId collision — the intent already exists; idempotent create.
  const existing = await db.query.intents.findFirst({ where: eq(intents.taskId, input.taskId) });
  if (!existing) throw new Error(`Intent insert for taskId ${input.taskId} neither inserted nor found`);
  return existing;
}

export async function getIntent(intentId: string): Promise<Intent | undefined> {
  return getDb().query.intents.findFirst({ where: eq(intents.id, intentId) });
}

export async function listAttempts(intentId: string): Promise<Attempt[]> {
  return getDb().query.attempts.findMany({
    where: eq(attempts.intentId, intentId),
    orderBy: desc(attempts.retryNumber),
  });
}

/**
 * The gate every attempt passes through. Refuses when a discrepancy has
 * blocked the intent — this is the double-spend defence, enforced at the
 * ledger, not left to executor discipline.
 */
export async function beginAttempt(input: NewAttempt): Promise<Attempt> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(intents).where(eq(intents.id, input.intentId)).for("update");
    if (!intent) throw new Error(`Intent ${input.intentId} not found`);
    if (intent.retryBlocked) throw new RetryBlockedError(intent.id, intent.blockedReason);
    await tx
      .update(intents)
      .set({ status: "executing", updatedAt: new Date() })
      .where(eq(intents.id, intent.id));
    const [attempt] = await tx.insert(attempts).values(input).returning();
    return attempt;
  });
}

export async function recordSubmission(
  attemptId: string,
  intentId: string,
  patch: Pick<Attempt, "executionId" | "reportedStatus" | "reportedTxHash" | "idempotentReplay">,
): Promise<Attempt> {
  const db = getDb();
  const [[attempt]] = await Promise.all([
    db.update(attempts).set(patch).where(eq(attempts.id, attemptId)).returning(),
    db
      .update(intents)
      .set({ status: "awaiting_verification", updatedAt: new Date() })
      .where(eq(intents.id, intentId)),
  ]);
  if (!attempt) throw new Error(`Attempt ${attemptId} not found`);
  return attempt;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type IntentStatus = Intent["status"];
type VerifiedStatus = Attempt["verifiedStatus"];

/** Shared close-out: stamp the attempt's chain verdict, move the intent. */
async function closeAttempt(
  tx: Tx,
  attemptId: string,
  verified: VerifiedStatus,
  intentStatus: IntentStatus,
): Promise<Attempt> {
  const [attempt] = await tx
    .update(attempts)
    .set({ verifiedStatus: verified, verifiedAt: new Date() })
    .where(eq(attempts.id, attemptId))
    .returning();
  if (!attempt) throw new Error(`Attempt ${attemptId} not found`);
  await tx
    .update(intents)
    .set({ status: intentStatus, updatedAt: new Date() })
    .where(eq(intents.id, attempt.intentId));
  return attempt;
}

/** Chain truth agreed with the report: settle (or mark reverted) off the receipt alone. */
export async function recordVerified(
  attemptId: string,
  receipt: NewReceipt,
  outcome: "settled" | "reverted",
): Promise<Receipt> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await closeAttempt(tx, attemptId, outcome === "settled" ? "success" : "reverted", outcome);
    const [row] = await tx.insert(receipts).values(receipt).returning();
    return row;
  });
}

/** Fail closed: chain could not confirm (not_found/timeout). Never settles. */
export async function recordUnverified(attemptId: string, verified: "not_found" | "timeout"): Promise<void> {
  await getDb().transaction(async (tx) => {
    await closeAttempt(tx, attemptId, verified, "unverified");
  });
}

/**
 * Reported failure with no hash and nothing on chain to contradict it: the
 * submission never broadcast. Intent returns to `pending` — a fresh attempt
 * is allowed; this is the ONLY failure path that re-opens the intent
 * automatically.
 */
export async function recordNoBroadcastFailure(attemptId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await closeAttempt(tx, attemptId, "not_found", "pending");
  });
}

export interface DiscrepancyInput {
  intentId: string;
  attemptId: string;
  kind: Discrepancy["kind"];
  reportedStatus: string;
  /** Already-narrowed chain verdict — the ledger stores it as-is, no coercion. */
  verifiedStatus: "success" | "reverted" | "not_found";
  detail?: string;
  /** Present when the chain truth is a mined receipt (reported-failed case). */
  receipt?: NewReceipt;
}

/**
 * Reported status and chain truth disagree. One transaction: the discrepancy
 * row, the receipt (when the chain has one), the attempt's verified status,
 * and the retry block all land together or not at all.
 */
export async function recordDiscrepancyAndBlock(input: DiscrepancyInput): Promise<Discrepancy> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(discrepancies)
      .values({
        intentId: input.intentId,
        attemptId: input.attemptId,
        kind: input.kind,
        reportedStatus: input.reportedStatus,
        verifiedStatus: input.verifiedStatus,
        detail: input.detail,
      })
      .returning();
    if (input.receipt) await tx.insert(receipts).values(input.receipt);
    await tx
      .update(attempts)
      .set({ verifiedStatus: input.verifiedStatus, verifiedAt: new Date() })
      .where(eq(attempts.id, input.attemptId));
    await tx
      .update(intents)
      .set({
        status: "blocked",
        retryBlocked: true,
        blockedReason: `${input.kind}: reported=${input.reportedStatus} chain=${input.verifiedStatus}`,
        updatedAt: new Date(),
      })
      .where(eq(intents.id, input.intentId));
    return row;
  });
}

/**
 * Tape row shapes: exactly the columns the dashboard renders — the jsonb
 * evidence blobs (simulation_raw, receipts.raw) stay off the 3s-poll wire.
 */
export type TapeAttempt = Pick<
  Attempt,
  | "id"
  | "intentId"
  | "retryNumber"
  | "trigger"
  | "idempotencyKey"
  | "executionId"
  | "reportedStatus"
  | "reportedTxHash"
  | "idempotentReplay"
  | "verifiedStatus"
  | "simulationWouldRevert"
  | "simulationGasEstimate"
  | "submittedAt"
>;
export type TapeIntent = Pick<
  Intent,
  "id" | "taskId" | "chainId" | "recipientAddress" | "amount" | "tokenAddress" | "status" | "retryBlocked" | "blockedReason"
>;
export type TapeReceipt = Pick<Receipt, "txHash" | "status" | "blockNumber" | "fromAddress">;
export type TapeDiscrepancy = Pick<Discrepancy, "id" | "kind" | "reportedStatus" | "verifiedStatus" | "detail">;

/** One tape row: an attempt with its intent, chain evidence, and any discrepancy. */
export interface TapeRow {
  attempt: TapeAttempt;
  intent: TapeIntent;
  receipt: TapeReceipt | null;
  discrepancy: TapeDiscrepancy | null;
}

/** Everything the dashboard needs in one read: newest attempts first + counters. */
export async function tapeSnapshot(limit = 50): Promise<{ rows: TapeRow[]; counters: Awaited<ReturnType<typeof countersSnapshot>> }> {
  const db = getDb();
  const joinQuery = db
    .select({
      attempt: {
        id: attempts.id,
        intentId: attempts.intentId,
        retryNumber: attempts.retryNumber,
        trigger: attempts.trigger,
        idempotencyKey: attempts.idempotencyKey,
        executionId: attempts.executionId,
        reportedStatus: attempts.reportedStatus,
        reportedTxHash: attempts.reportedTxHash,
        idempotentReplay: attempts.idempotentReplay,
        verifiedStatus: attempts.verifiedStatus,
        simulationWouldRevert: attempts.simulationWouldRevert,
        simulationGasEstimate: attempts.simulationGasEstimate,
        submittedAt: attempts.submittedAt,
      },
      intent: {
        id: intents.id,
        taskId: intents.taskId,
        chainId: intents.chainId,
        recipientAddress: intents.recipientAddress,
        amount: intents.amount,
        tokenAddress: intents.tokenAddress,
        status: intents.status,
        retryBlocked: intents.retryBlocked,
        blockedReason: intents.blockedReason,
      },
      receipt: {
        txHash: receipts.txHash,
        status: receipts.status,
        blockNumber: receipts.blockNumber,
        fromAddress: receipts.fromAddress,
      },
      discrepancy: {
        id: discrepancies.id,
        kind: discrepancies.kind,
        reportedStatus: discrepancies.reportedStatus,
        verifiedStatus: discrepancies.verifiedStatus,
        detail: discrepancies.detail,
      },
    })
    .from(attempts)
    .innerJoin(intents, eq(attempts.intentId, intents.id))
    .leftJoin(receipts, eq(receipts.attemptId, attempts.id))
    .leftJoin(discrepancies, eq(discrepancies.attemptId, attempts.id))
    .orderBy(desc(attempts.submittedAt))
    .limit(limit);

  const [joined, counters] = await Promise.all([joinQuery, countersSnapshot()]);
  // Nested selections over left joins come back as all-null objects, not null.
  const rows: TapeRow[] = joined.map((r) => ({
    attempt: r.attempt,
    intent: r.intent,
    receipt: r.receipt && r.receipt.txHash !== null ? (r.receipt as TapeReceipt) : null,
    discrepancy: r.discrepancy && r.discrepancy.id !== null ? (r.discrepancy as TapeDiscrepancy) : null,
  }));
  return { rows, counters };
}

/** Parked intents awaiting another independent read, oldest first. */
export async function listUnverifiedIntents(limit = 20): Promise<Intent[]> {
  return getDb().query.intents.findMany({
    where: eq(intents.status, "unverified"),
    orderBy: intents.updatedAt,
    limit,
  });
}

export async function latestAttempt(intentId: string): Promise<Attempt | undefined> {
  return getDb().query.attempts.findFirst({
    where: eq(attempts.intentId, intentId),
    orderBy: [desc(attempts.retryNumber), desc(attempts.submittedAt)],
  });
}

/** One more re-verification pass ran without a decidable receipt. Returns the new count. */
export async function bumpReverifyCount(attemptId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .update(attempts)
    .set({ reverifyCount: sql`${attempts.reverifyCount} + 1` })
    .where(eq(attempts.id, attemptId))
    .returning({ reverifyCount: attempts.reverifyCount });
  if (!row) throw new Error(`Attempt ${attemptId} not found`);
  return row.reverifyCount;
}

/** Bounded re-verification exhausted: terminal, human-owned. Never guessed past. */
export async function markNeedsReview(intentId: string, reason: string): Promise<void> {
  await getDb()
    .update(intents)
    .set({ status: "needs_review", blockedReason: reason, updatedAt: new Date() })
    .where(eq(intents.id, intentId));
}

export async function countersSnapshot() {
  const db = getDb();
  // One round trip, not three — this sits on the dashboard's 3s poll.
  const { rows } = await db.execute<{ settled: number; reconciled: number; caught: number }>(sql`
    select
      (select count(*)::int from intents where status = 'settled') as settled,
      (select count(*)::int from attempts where verified_status = 'success') as reconciled,
      (select count(*)::int from discrepancies) as caught
  `);
  const [c] = rows;
  return { settled: c.settled, reconciled: c.reconciled, discrepanciesCaught: c.caught };
}
