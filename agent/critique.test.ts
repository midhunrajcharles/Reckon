import { describe, expect, it, vi } from "vitest";
import type { Attempt } from "db";
import { critiqueAttempt, type CritiqueLedger } from "./critique";
import type { ReceiptReader } from "./observe";

const HASH = "0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04";
const noSleep = { sleep: async () => {}, pollIntervalMs: 1, timeoutMs: 0 };

function attempt(overrides: Partial<Attempt>): Attempt {
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
    verifiedStatus: "unchecked",
    reverifyCount: 0,
    submittedAt: new Date(),
    verifiedAt: null,
    ...overrides,
  };
}

function fakeLedger(): CritiqueLedger & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const track =
    (name: string, ret?: unknown) =>
    async (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return ret as never;
    };
  return {
    calls,
    recordVerified: track("recordVerified", {}) as CritiqueLedger["recordVerified"],
    recordUnverified: track("recordUnverified") as CritiqueLedger["recordUnverified"],
    recordNoBroadcastFailure: track("recordNoBroadcastFailure") as CritiqueLedger["recordNoBroadcastFailure"],
    recordDiscrepancyAndBlock: track("recordDiscrepancyAndBlock", {}) as CritiqueLedger["recordDiscrepancyAndBlock"],
  };
}

function readerWith(receipt: Record<string, unknown> | "not_found"): ReceiptReader {
  return {
    getTransactionReceipt: async () => {
      if (receipt === "not_found") {
        const err = new Error("nope");
        err.name = "TransactionReceiptNotFoundError";
        throw err;
      }
      return receipt as { status: "success" | "reverted" };
    },
    getTransaction: async () => {
      throw new Error("tx not found");
    },
  };
}

const minedSuccess = {
  status: "success",
  transactionHash: HASH,
  blockNumber: 45302623n,
  blockHash: "0x0a90",
  from: "0xrelayer",
  to: "0xwallet",
  gasUsed: 80497n,
};

describe("critiqueAttempt", () => {
  it("THE CASE: reported failed + chain success → discrepancy row, retry blocked, no second tx", async () => {
    const ledger = fakeLedger();
    const verdict = await critiqueAttempt(attempt({ reportedStatus: "failed" }), readerWith(minedSuccess), {
      ...noSleep,
      ledger,
    });

    expect(verdict).toMatchObject({ action: "block", kind: "reported_failed_chain_success" });
    expect(ledger.calls.recordDiscrepancyAndBlock).toHaveLength(1);
    const [input] = ledger.calls.recordDiscrepancyAndBlock[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      intentId: "intent-1",
      attemptId: "attempt-1",
      kind: "reported_failed_chain_success",
      reportedStatus: "failed",
      verifiedStatus: "success",
    });
    // The mined receipt is preserved as evidence, bigints already serialisable.
    expect((input.receipt as Record<string, unknown>).blockNumber).toBe("45302623");
    // And nothing settled, nothing retried.
    expect(ledger.calls.recordVerified).toBeUndefined();
    expect(ledger.calls.recordNoBroadcastFailure).toBeUndefined();
  });

  it("settles only when the independent receipt is a success", async () => {
    const ledger = fakeLedger();
    const verdict = await critiqueAttempt(attempt({}), readerWith(minedSuccess), { ...noSleep, ledger });
    expect(verdict.action).toBe("settle");
    expect(ledger.calls.recordVerified?.[0]?.[2]).toBe("settled");
  });

  it("reported success + chain revert → blocked with the receipt as evidence", async () => {
    const ledger = fakeLedger();
    const verdict = await critiqueAttempt(
      attempt({}),
      readerWith({ ...minedSuccess, status: "reverted" }),
      { ...noSleep, ledger },
    );
    expect(verdict).toMatchObject({ action: "block", kind: "reported_success_chain_reverted" });
    expect(ledger.calls.recordDiscrepancyAndBlock).toHaveLength(1);
  });

  it("reported success + no trace on chain → blocked, fail closed", async () => {
    const ledger = fakeLedger();
    const verdict = await critiqueAttempt(attempt({}), readerWith("not_found"), { ...noSleep, ledger });
    expect(verdict).toMatchObject({ action: "block", kind: "reported_success_not_found" });
  });

  it("agreed revert → recorded as reverted, retry stays open", async () => {
    const ledger = fakeLedger();
    const verdict = await critiqueAttempt(
      attempt({ reportedStatus: "failed" }),
      readerWith({ ...minedSuccess, status: "reverted" }),
      { ...noSleep, ledger },
    );
    expect(verdict.action).toBe("retryable_failure");
    expect(ledger.calls.recordVerified?.[0]?.[2]).toBe("reverted");
    expect(ledger.calls.recordDiscrepancyAndBlock).toBeUndefined();
  });

  it("reported failure with no hash → no-broadcast failure, intent re-opens", async () => {
    const ledger = fakeLedger();
    const reader: ReceiptReader = {
      getTransactionReceipt: vi.fn(async () => {
        throw new Error("must not be called");
      }),
      getTransaction: vi.fn(async () => null),
    };
    const verdict = await critiqueAttempt(
      attempt({ reportedStatus: "failed", reportedTxHash: null }),
      reader,
      { ...noSleep, ledger },
    );
    expect(verdict.action).toBe("retryable_failure");
    expect(ledger.calls.recordNoBroadcastFailure).toHaveLength(1);
    expect(reader.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("timeout → parked unverified as timeout, nothing settles", async () => {
    const ledger = fakeLedger();
    const reader = readerWith("not_found");
    reader.getTransaction = async () => ({ hash: HASH });
    const verdict = await critiqueAttempt(attempt({}), reader, { ...noSleep, ledger });
    expect(verdict.action).toBe("reverify");
    expect(ledger.calls.recordUnverified?.[0]).toEqual(["attempt-1", "timeout"]);
  });
});
