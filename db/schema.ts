import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Intent lifecycle. The four terminal states are the ones the tape colour-codes:
 * settled, blocked, reverted, unverified. An intent is only `settled` when an
 * independently fetched receipt says success — reported status never settles it.
 */
export const intentStatus = pgEnum("intent_status", [
  "pending",
  "executing",
  "awaiting_verification",
  "settled",
  "blocked",
  "reverted",
  "unverified",
  // Terminal: bounded re-verification exhausted without a decidable receipt.
  // A human looks at it; the agent never guesses.
  "needs_review",
]);

/**
 * Chain truth as the critique agent determined it. `not_found` and `timeout`
 * fail CLOSED: they never settle an intent, they park it as unverified.
 */
export const verifiedStatus = pgEnum("verified_status", [
  "unchecked",
  "success",
  "reverted",
  "not_found",
  "timeout",
]);

export const discrepancyKind = pgEnum("discrepancy_kind", [
  // The known KeeperHub/Tempo bug: platform says FAILED, chain says mined.
  // A naive agent retries and double-spends — this row is what blocks that.
  "reported_failed_chain_success",
  "reported_success_chain_reverted",
  "reported_success_not_found",
]);

/** One settlement the operator asked for. */
export const intents = pgTable(
  "intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Business id; scheduled jobs must bake the period in or idempotency keys collide. */
    taskId: text("task_id").notNull(),
    chainId: integer("chain_id").notNull(),
    recipientAddress: text("recipient_address").notNull(),
    /** Canonical plain decimal string — same form the idempotency key hashes. */
    amount: text("amount").notNull(),
    /** Null = native transfer. */
    tokenAddress: text("token_address"),
    status: intentStatus("status").notNull().default("pending"),
    /**
     * The double-spend defence. Once true, the executor refuses further
     * attempts for this intent until a human clears the discrepancy.
     */
    retryBlocked: boolean("retry_blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intents_task_id_idx").on(t.taskId)],
);

/** One executor swing at an intent — simulation, bid, submission, both statuses. */
export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => intents.id),
    /** 0 = first attempt. */
    retryNumber: integer("retry_number").notNull(),
    /** What caused this attempt: initial | retry | chaos_inject_failure | chaos_inject_gas_spike. */
    trigger: text("trigger").notNull(),
    /** SHA-256 hex of the documented stable-key recipe. */
    idempotencyKey: text("idempotency_key").notNull(),
    simulationWouldRevert: boolean("simulation_would_revert"),
    simulationGasEstimate: text("simulation_gas_estimate"),
    simulationRaw: jsonb("simulation_raw"),
    /** Gas bid — string, exactly as the API takes it (e.g. "1.5"). */
    gasLimitMultiplier: text("gas_limit_multiplier"),
    executionId: text("execution_id"),
    /** Platform's claim, verbatim. A hypothesis, never a fact. */
    reportedStatus: text("reported_status"),
    /** Hash the platform handed back — what the critique agent verifies independently. */
    reportedTxHash: text("reported_tx_hash"),
    /** True if KeeperHub answered this submission from its replay cache. */
    idempotentReplay: boolean("idempotent_replay").notNull().default(false),
    /** Chain truth per the critique agent. */
    verifiedStatus: verifiedStatus("verified_status").notNull().default("unchecked"),
    /** How many re-verification passes have run on this attempt (bounded). */
    reverifyCount: integer("reverify_count").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    index("attempts_intent_id_idx").on(t.intentId),
    index("attempts_idempotency_key_idx").on(t.idempotencyKey),
  ],
);

/** An independently fetched (viem, our own RPC) receipt — the only settle authority. */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    txHash: text("tx_hash").notNull(),
    /** viem receipt status: success | reverted. */
    status: text("status").notNull(),
    blockNumber: text("block_number"),
    blockHash: text("block_hash"),
    /** Sponsored txs: this is the relayer, not the org wallet. */
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    gasUsed: text("gas_used"),
    raw: jsonb("raw").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_attempt_id_idx").on(t.attemptId), index("receipts_tx_hash_idx").on(t.txHash)],
);

/** Reported status and chain truth disagreed. Writing this row blocks the retry. */
export const discrepancies = pgTable(
  "discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => intents.id),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    kind: discrepancyKind("kind").notNull(),
    reportedStatus: text("reported_status").notNull(),
    verifiedStatus: text("verified_status").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("discrepancies_intent_id_idx").on(t.intentId)],
);

export type Intent = typeof intents.$inferSelect;
export type NewIntent = typeof intents.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type Discrepancy = typeof discrepancies.$inferSelect;
export type NewDiscrepancy = typeof discrepancies.$inferInsert;
