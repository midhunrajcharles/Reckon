import { describe, expect, it } from "vitest";
import { AGENT_STATUSES, classifyReportedStatus, reconcile, type ChainObservation } from "./verification";

const HASH = "0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04";
const receiptSuccess: ChainObservation = { kind: "receipt", status: "success" };
const receiptReverted: ChainObservation = { kind: "receipt", status: "reverted" };

describe("classifyReportedStatus", () => {
  it.each([
    ["completed", "success"],
    ["SUCCESS", "success"],
    [" Confirmed ", "success"],
    ["failed", "failure"],
    ["FAILED", "failure"],
    ["error", "failure"],
    ["cancelled", "failure"],
    ["banana", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    ["", "unknown"],
  ])("%s → %s", (input, expected) => {
    expect(classifyReportedStatus(input)).toBe(expected);
  });

  // The fail-closed property: every agent-minted status must stay `unknown`.
  // Promoting one into FAILURE_STATUSES would free the attempt for a
  // re-broadcast on evidence that never came from the chain.
  it.each(Object.entries(AGENT_STATUSES))("agent status %s (%s) classifies as unknown", (_name, status) => {
    expect(classifyReportedStatus(status)).toBe("unknown");
  });
});

describe("reconcile — the double-spend defence", () => {
  it("BLOCKS when platform says failed but the chain holds a successful receipt (the known bug)", () => {
    const verdict = reconcile({ status: "failed", transactionHash: HASH }, receiptSuccess);
    expect(verdict).toMatchObject({ action: "block", kind: "reported_failed_chain_success" });
  });

  it("settles only on a successful independent receipt", () => {
    expect(reconcile({ status: "completed", transactionHash: HASH }, receiptSuccess)).toEqual({ action: "settle" });
  });

  it("settles on chain success even when the reported status is unrecognised — chain truth is authoritative", () => {
    expect(reconcile({ status: "weird_new_status", transactionHash: HASH }, receiptSuccess)).toEqual({
      action: "settle",
    });
  });

  it("BLOCKS when platform says success but the receipt is a revert", () => {
    const verdict = reconcile({ status: "completed", transactionHash: HASH }, receiptReverted);
    expect(verdict).toMatchObject({ action: "block", kind: "reported_success_chain_reverted" });
  });

  it("allows retry when both sides agree it reverted", () => {
    expect(reconcile({ status: "failed", transactionHash: HASH }, receiptReverted)).toMatchObject({
      action: "retryable_failure",
    });
  });

  it("BLOCKS when platform says success but the chain has no trace of the hash", () => {
    const verdict = reconcile({ status: "completed", transactionHash: HASH }, { kind: "not_found" });
    expect(verdict).toMatchObject({ action: "block", kind: "reported_success_not_found" });
  });
});

describe("reconcile — fail closed", () => {
  it("never settles on a timeout, regardless of the reported status", () => {
    for (const status of ["completed", "failed", "unknown", null]) {
      expect(reconcile({ status, transactionHash: HASH }, { kind: "timeout" })).toMatchObject({
        action: "reverify",
      });
    }
  });

  it("parks reported-failure + not_found as reverify, not retry — cannot prove it never landed", () => {
    expect(reconcile({ status: "failed", transactionHash: HASH }, { kind: "not_found" })).toMatchObject({
      action: "reverify",
    });
  });

  it("never settles a success claim that has no hash to verify", () => {
    expect(reconcile({ status: "completed", transactionHash: null }, { kind: "no_hash" })).toMatchObject({
      action: "reverify",
    });
  });

  it("allows retry on reported failure with no hash — nothing on chain contradicts it", () => {
    expect(reconcile({ status: "failed", transactionHash: null }, { kind: "no_hash" })).toMatchObject({
      action: "retryable_failure",
    });
  });

  it("no observation kind ever settles except a success receipt", () => {
    const observations: ChainObservation[] = [receiptReverted, { kind: "no_hash" }, { kind: "not_found" }, { kind: "timeout" }];
    for (const chain of observations) {
      for (const status of ["completed", "failed", null, "weird"]) {
        expect(reconcile({ status, transactionHash: HASH }, chain).action).not.toBe("settle");
      }
    }
  });
});
