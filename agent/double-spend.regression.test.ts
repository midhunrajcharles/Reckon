/**
 * GATE 4 — the double-spend regression test.
 *
 * The scenario the whole product exists for: a settlement mines on chain but
 * the platform reports it FAILED. A naive agent retries and pays twice.
 * This test proves, against the REAL ledger (Neon), that Reckon:
 *
 *   1. blocks the intent when the critique agent catches the mismatch,
 *   2. refuses a second attempt at the ledger (RetryBlockedError),
 *   3. and — the number that matters — broadcasts EXACTLY ONCE.
 *
 * KeeperHub and the RPC are stubbed (no live network, no real broadcasts);
 * the database is real. Self-skips when DATABASE_URL is absent.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, discrepancies, getDb, intents, RetryBlockedError } from "db";
import { runIntentOnce } from "./executor";
import type { ReceiptReader } from "./observe";
import { cleanupTaskIds, stubClient } from "./test-support";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const TX_HASH = "0x00000000000000000000000000000000000000000000000000000000000000f4";
const TASK_ID = `regression-double-spend-${Date.now()}`;

/** Counts broadcasts — the assertion that matters lives on this stub. */
const makeStubClient = () =>
  stubClient(async () => ({
    executionId: "stub-exec-1",
    transactionHash: TX_HASH,
    status: "completed",
    raw: { stub: true },
  }));

/** Chain truth: the tx IS mined and successful — that is the point. */
const minedReader: ReceiptReader = {
  getTransactionReceipt: async () => ({
    status: "success",
    transactionHash: TX_HASH,
    blockNumber: 1n,
    blockHash: "0xstub",
    from: "0xstub",
    to: "0xstub",
    gasUsed: 21000n,
  }),
  getTransaction: async () => ({ hash: TX_HASH }),
};

describe.skipIf(!HAS_DB)("double-spend regression (real ledger)", () => {
  afterAll(async () => {
    if (HAS_DB) await cleanupTaskIds([TASK_ID]);
  }, 60_000);

  it("broadcasts once, blocks on the lie, and refuses the retry", { timeout: 60_000 }, async () => {
    const { client, calls } = makeStubClient();
    const input = {
      taskId: TASK_ID,
      chainId: 84532,
      recipientAddress: "0x4807d3517aca44fadd988d94a2da7dc382ce72e8" as const,
      amount: "0",
    };

    // Act 1: the poisoned run — mined on chain, reported "failed".
    const first = await runIntentOnce(
      client,
      { ...input, injectReportedStatus: "failed" },
      { reader: minedReader },
    );
    expect(first.verdict).toMatchObject({ action: "block", kind: "reported_failed_chain_success" });
    expect(calls.execute).toBe(1);

    // The ledger holds the evidence: one discrepancy row, intent blocked.
    const db = getDb();
    const [intent] = await db.select().from(intents).where(eq(intents.taskId, TASK_ID));
    expect(intent.status).toBe("blocked");
    expect(intent.retryBlocked).toBe(true);
    const disc = await db.select().from(discrepancies).where(eq(discrepancies.intentId, intent.id));
    expect(disc).toHaveLength(1);
    expect(disc[0].kind).toBe("reported_failed_chain_success");

    // Act 2: the naive retry. Must die at the ledger with ZERO further
    // KeeperHub calls — not even a simulation.
    const before = { ...calls };
    await expect(runIntentOnce(client, input, { reader: minedReader })).rejects.toThrow(
      RetryBlockedError,
    );
    expect(calls.simulate).toBe(before.simulate);
    expect(calls.execute).toBe(before.execute);

    // The headline number: one broadcast, ever.
    expect(calls.execute).toBe(1);

    // And the ledger still holds exactly one attempt row for this intent.
    const atts = await db.select().from(attempts).where(eq(attempts.intentId, intent.id));
    expect(atts).toHaveLength(1);
  });
});
