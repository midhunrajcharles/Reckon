import { describe, expect, it } from "vitest";
import type { Attempt, Intent } from "db";
import type { CritiqueLedger } from "./critique";
import { runReverifyPass } from "./reverify";
import type { ReceiptReader } from "./observe";

const HASH = "0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04";
const noSleep = { sleep: async () => {}, pollIntervalMs: 1, timeoutMs: 0 };

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: "intent-1",
    taskId: "task-1",
    chainId: 84532,
    recipientAddress: "0xwallet",
    amount: "0",
    tokenAddress: null,
    status: "unverified",
    retryBlocked: false,
    blockedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "attempt-1",
    intentId: "intent-1",
    retryNumber: 0,
    trigger: "initial",
    idempotencyKey: "k",
    simulationWouldRevert: false,
    simulationGasEstimate: "21000",
    simulationRaw: null,
    gasLimitMultiplier: null,
    executionId: "exec-1",
    reportedStatus: "completed",
    reportedTxHash: HASH,
    idempotentReplay: false,
    verifiedStatus: "timeout",
    reverifyCount: 0,
    submittedAt: new Date(),
    verifiedAt: null,
    ...overrides,
  };
}

function noopCritiqueLedger(): CritiqueLedger {
  const noop = async () => ({}) as never;
  return {
    recordVerified: noop,
    recordUnverified: async () => {},
    recordNoBroadcastFailure: async () => {},
    recordDiscrepancyAndBlock: noop,
  };
}

function pendingReader(): ReceiptReader {
  return {
    getTransactionReceipt: async () => {
      const err = new Error("nope");
      err.name = "TransactionReceiptNotFoundError";
      throw err;
    },
    getTransaction: async () => ({ hash: HASH }),
  };
}

function minedReader(status: "success" | "reverted" = "success"): ReceiptReader {
  return {
    getTransactionReceipt: async () => ({ status, blockNumber: 1n, transactionHash: HASH }),
    getTransaction: async () => ({ hash: HASH }),
  };
}

function deps(overrides: Record<string, unknown>) {
  const marked: string[] = [];
  const bumps: string[] = [];
  let count = 0;
  return {
    marked,
    bumps,
    deps: {
      listUnverifiedIntents: async () => [intent()],
      latestAttempt: async () => attempt({ reverifyCount: count }),
      bumpReverifyCount: async (id: string) => {
        bumps.push(id);
        count += 1;
        return count;
      },
      markNeedsReview: async (id: string, reason: string) => {
        marked.push(`${id}:${reason}`);
      },
      readerFor: () => pendingReader(),
      critiqueLedger: noopCritiqueLedger(),
      observe: noSleep,
      ...overrides,
    },
  };
}

describe("runReverifyPass", () => {
  it("a late receipt resolves the intent through the normal critique path", async () => {
    const d = deps({ readerFor: () => minedReader("success") });
    const results = await runReverifyPass(d.deps);
    expect(results).toEqual([
      { intentId: "intent-1", taskId: "task-1", outcome: "resolved", verdictAction: "settle" },
    ]);
    expect(d.bumps).toHaveLength(0);
    expect(d.marked).toHaveLength(0);
  });

  it("a late receipt that contradicts the report still blocks — the defence never expires", async () => {
    const d = deps({
      readerFor: () => minedReader("success"),
      latestAttempt: async () => attempt({ reportedStatus: "failed" }),
    });
    const results = await runReverifyPass(d.deps);
    expect(results[0]).toMatchObject({ outcome: "resolved", verdictAction: "block" });
  });

  it("an undecidable chain bumps the counter and stays parked", async () => {
    const d = deps({});
    const results = await runReverifyPass(d.deps);
    expect(results[0]).toMatchObject({ outcome: "still_unverified", reverifyCount: 1 });
    expect(d.marked).toHaveLength(0);
  });

  it("escalates to needs_review exactly at the bound, never before", async () => {
    const d = deps({ maxReverifies: 3 });
    expect((await runReverifyPass(d.deps))[0].outcome).toBe("still_unverified");
    expect((await runReverifyPass(d.deps))[0].outcome).toBe("still_unverified");
    const third = await runReverifyPass(d.deps);
    expect(third[0]).toMatchObject({ outcome: "needs_review", reverifyCount: 3 });
    expect(d.marked).toHaveLength(1);
    expect(d.marked[0]).toContain("re-verification exhausted after 3 passes");
  });

  it("skips intents with no attempts instead of crashing the pass", async () => {
    const d = deps({ latestAttempt: async () => undefined });
    const results = await runReverifyPass(d.deps);
    expect(results[0]).toMatchObject({ outcome: "skipped_no_attempt" });
  });

  it("isolates a failing intent so the rest of the pass still runs", async () => {
    // The attempt row vanished between the list and the bump — a real race
    // against ledger cleanup. Every intent hits it here; the point is that the
    // first throw does not starve the two behind it.
    const d = deps({
      listUnverifiedIntents: async () => [
        intent({ id: "intent-1", taskId: "task-1" }),
        intent({ id: "intent-2", taskId: "task-2" }),
        intent({ id: "intent-3", taskId: "task-3" }),
      ],
      latestAttempt: async (intentId: string) => attempt({ intentId }),
      bumpReverifyCount: async (id: string) => {
        throw new Error(`Attempt ${id} not found`);
      },
    });

    const results = await runReverifyPass(d.deps);

    // Every intent got a turn — none was skipped by an earlier throw.
    expect(results.map((r) => r.taskId)).toEqual(["task-1", "task-2", "task-3"]);
    expect(results.map((r) => r.outcome)).toEqual(["failed", "failed", "failed"]);
    expect(results[0].error).toContain("not found");
  });
});
