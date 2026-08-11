/**
 * Regression: a failed submission must never strand an attempt.
 *
 * `beginAttempt` writes the attempt row BEFORE the broadcast. If the submission
 * then fails and the error simply escapes `runIntentOnce`, the row is never
 * closed out and the intent sits in `executing` — a status no loop watches.
 * `listUnverifiedIntents` only selects `unverified`, so the re-verify loop
 * would never look at it again, while a transaction may well be live on chain.
 *
 * The two halves of the rule:
 *   - ambiguous failure (HTTP/transport — a broadcast MAY have happened):
 *     fail closed, park as `unverified`, let the chain decide later.
 *   - pre-broadcast failure (config/validation — nothing left the process):
 *     close out as a non-broadcast failure, returning the intent to `pending`,
 *     and surface the error.
 *
 * KeeperHub and the RPC are stubbed (no live network, no real broadcasts);
 * the database is real. Self-skips when DATABASE_URL is absent.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { KeeperHubConfigError, KeeperHubHttpError } from "lib";
import { getDb, intents, listUnverifiedIntents } from "db";
import { runIntentOnce } from "./executor";
import type { ReceiptReader } from "./observe";
import { cleanupTaskIds, stubClient } from "./test-support";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const STAMP = Date.now();
const AMBIGUOUS_TASK_ID = `regression-ambiguous-submission-${STAMP}`;
const PREFLIGHT_TASK_ID = `regression-preflight-failure-${STAMP}`;
const TASK_IDS = [AMBIGUOUS_TASK_ID, PREFLIGHT_TASK_ID];

/** Simulation succeeds; the broadcast is what fails. */
const makeFailingClient = (error: Error) =>
  stubClient(async () => {
    throw error;
  });

/** Nothing on chain — the submission produced no hash to look up. */
const emptyReader: ReceiptReader = {
  getTransactionReceipt: async () => {
    throw Object.assign(new Error("not found"), { name: "TransactionReceiptNotFoundError" });
  },
  getTransaction: async () => null,
};

const input = {
  chainId: 84532,
  recipientAddress: "0x4807d3517aca44fadd988d94a2da7dc382ce72e8" as const,
  amount: "0",
};

describe.skipIf(!HAS_DB)("submission failure never strands an attempt (real ledger)", () => {
  afterAll(async () => {
    if (HAS_DB) await cleanupTaskIds(TASK_IDS);
  }, 60_000);

  it("parks an ambiguous submission failure as unverified, where the re-verify loop can see it", async () => {
    // A 503 says nothing about whether the broadcast landed.
    const { client, calls } = makeFailingClient(new KeeperHubHttpError(503, undefined, { message: "upstream" }));

    const outcome = await runIntentOnce(
      client,
      { taskId: AMBIGUOUS_TASK_ID, ...input },
      { reader: emptyReader },
    );

    expect(calls.execute).toBe(1);
    // Fail closed: never settled, never freed for an automatic retry.
    expect(outcome.verdict.action).toBe("reverify");

    const db = getDb();
    const [intent] = await db.select().from(intents).where(eq(intents.taskId, AMBIGUOUS_TASK_ID));
    expect(intent.status).toBe("unverified");

    // The property that actually matters: the re-verify loop picks it up.
    const parked = await listUnverifiedIntents(100);
    expect(parked.map((i) => i.id)).toContain(intent.id);
  }, 60_000);

  it("closes a pre-broadcast failure out as retryable and still surfaces the error", async () => {
    // Nothing reached the network, so `pending` is the honest resting state.
    const { client, calls } = makeFailingClient(new KeeperHubConfigError("KEEPERHUB_API_KEY is not set."));

    await expect(
      runIntentOnce(client, { taskId: PREFLIGHT_TASK_ID, ...input }, { reader: emptyReader }),
    ).rejects.toThrow(KeeperHubConfigError);

    expect(calls.execute).toBe(1);

    const db = getDb();
    const [intent] = await db.select().from(intents).where(eq(intents.taskId, PREFLIGHT_TASK_ID));
    expect(intent.status).toBe("pending");
    expect(intent.retryBlocked).toBe(false);
  }, 60_000);
});
