import { describe, expect, it } from "vitest";
import { observeTransaction, type ReceiptReader } from "./observe";

const HASH = "0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04";
const noSleep = { sleep: async () => {}, pollIntervalMs: 1 };

function notFoundError(): Error {
  const err = new Error("receipt not found");
  err.name = "TransactionReceiptNotFoundError";
  return err;
}

function reader(overrides: Partial<ReceiptReader>): ReceiptReader {
  return {
    getTransactionReceipt: async () => {
      throw notFoundError();
    },
    getTransaction: async () => {
      throw new Error("tx not found");
    },
    ...overrides,
  };
}

describe("observeTransaction", () => {
  it("returns no_hash without touching the RPC when there is no hash", async () => {
    const { observation } = await observeTransaction(
      reader({
        getTransactionReceipt: async () => {
          throw new Error("must not be called");
        },
      }),
      null,
    );
    expect(observation).toEqual({ kind: "no_hash" });
  });

  it("maps a mined receipt through, success and reverted", async () => {
    for (const status of ["success", "reverted"] as const) {
      const { observation, receipt } = await observeTransaction(
        reader({ getTransactionReceipt: async () => ({ status, blockNumber: 1n }) }),
        HASH,
      );
      expect(observation).toEqual({ kind: "receipt", status });
      expect(receipt).toBeDefined();
    }
  });

  it("polls until the receipt lands within the budget", async () => {
    let calls = 0;
    const { observation } = await observeTransaction(
      reader({
        getTransactionReceipt: async () => {
          calls += 1;
          if (calls < 3) throw notFoundError();
          return { status: "success" };
        },
      }),
      HASH,
      { ...noSleep, timeoutMs: 10_000 },
    );
    expect(observation).toEqual({ kind: "receipt", status: "success" });
    expect(calls).toBe(3);
  });

  it("times out to `timeout` when the tx is known but unmined — fail closed", async () => {
    const { observation } = await observeTransaction(
      reader({ getTransaction: async () => ({ hash: HASH }) }),
      HASH,
      { ...noSleep, timeoutMs: 0 },
    );
    expect(observation).toEqual({ kind: "timeout" });
  });

  it("resolves to `not_found` when the chain has no trace at all", async () => {
    const { observation } = await observeTransaction(reader({}), HASH, { ...noSleep, timeoutMs: 0 });
    expect(observation).toEqual({ kind: "not_found" });
  });

  it("treats RPC/network failures as timeout, never as a verdict", async () => {
    const { observation } = await observeTransaction(
      reader({
        getTransactionReceipt: async () => {
          throw new Error("ECONNRESET");
        },
      }),
      HASH,
      { ...noSleep, timeoutMs: 5_000 },
    );
    expect(observation).toEqual({ kind: "timeout" });
  });
});
