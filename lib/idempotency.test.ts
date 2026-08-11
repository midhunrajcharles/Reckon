import { describe, expect, it } from "vitest";
import {
  canonicalAmount,
  classifySubmissionError,
  classifySubmissionResult,
  computeIdempotencyKey,
  idempotencyKeyMaterial,
  scheduledTaskId,
} from "./idempotency";
import {
  KeeperHubConfigError,
  KeeperHubHttpError,
  KeeperHubIdempotencyConflictError,
  KeeperHubWireValidationError,
} from "./keeperhub/errors";

const BASE = {
  taskId: "invoice-42",
  chainId: 84532,
  recipientAddress: "0x4807D3517acA44fadd988d94a2Da7Dc382CE72E8",
  amount: "0",
};

describe("canonicalAmount", () => {
  it.each([
    ["0", "0"],
    ["0.0", "0"],
    ["000", "0"],
    ["00.500", "0.5"],
    [".5", "0.5"],
    ["1.50", "1.5"],
    ["1e18", "1000000000000000000"],
    ["1.5e2", "150"],
    ["2.5e-3", "0.0025"],
    ["1.000000000000000001", "1.000000000000000001"],
    [" 42 ", "42"],
  ])("canonicalises %s → %s", (input, expected) => {
    expect(canonicalAmount(input)).toBe(expected);
  });

  it.each(["-1", "1,5", "1e", "abc", "", "1.2.3", "+5"])("rejects %s", (input) => {
    expect(() => canonicalAmount(input)).toThrow();
  });

  it("does not round 18-decimal amounts through floats", () => {
    expect(canonicalAmount("123456789.123456789012345678")).toBe("123456789.123456789012345678");
  });
});

describe("idempotencyKeyMaterial", () => {
  it("builds the documented pipe-separated preimage, addresses lowercased, empty token slot for native", () => {
    expect(idempotencyKeyMaterial(BASE)).toBe(
      "invoice-42|84532|0x4807d3517aca44fadd988d94a2da7dc382ce72e8|0|",
    );
  });

  it("keeps the token slot distinct from native", () => {
    const token = idempotencyKeyMaterial({
      ...BASE,
      tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    });
    expect(token.endsWith("|0x036cbd53842c5426634e7929541ec2318f3dcf7e")).toBe(true);
    expect(token).not.toBe(idempotencyKeyMaterial(BASE));
  });

  it("rejects malformed addresses, non-positive chains, and pipes in taskId", () => {
    expect(() => idempotencyKeyMaterial({ ...BASE, recipientAddress: "0x123" })).toThrow();
    expect(() => idempotencyKeyMaterial({ ...BASE, chainId: 0 })).toThrow();
    expect(() => idempotencyKeyMaterial({ ...BASE, taskId: "a|b" })).toThrow();
  });
});

describe("computeIdempotencyKey", () => {
  it("matches the independently computed SHA-256 vector", () => {
    expect(computeIdempotencyKey(BASE)).toBe(
      "a85c53cc9dae7654b5d4db4d237329106fed2a57eb95e1c0de0e2c8dbcff605e",
    );
  });

  it("is insensitive to address case and amount formatting — the replay guarantee", () => {
    const variant = {
      taskId: "invoice-42",
      chainId: 84532,
      recipientAddress: "0x4807d3517aca44fadd988d94a2da7dc382ce72e8",
      amount: "0.000",
    };
    expect(computeIdempotencyKey(variant)).toBe(computeIdempotencyKey(BASE));
  });

  it("changes when any component changes", () => {
    const base = computeIdempotencyKey(BASE);
    expect(computeIdempotencyKey({ ...BASE, taskId: "invoice-43" })).not.toBe(base);
    expect(computeIdempotencyKey({ ...BASE, chainId: 8453 })).not.toBe(base);
    expect(computeIdempotencyKey({ ...BASE, amount: "1" })).not.toBe(base);
  });
});

describe("scheduledTaskId", () => {
  it("gives different periods different taskIds — no collision across the 24h replay window", () => {
    const d1 = new Date("2026-08-10T09:30:00Z");
    const d2 = new Date("2026-08-11T09:30:00Z");
    expect(scheduledTaskId("payroll", d1, "daily")).toBe("payroll@2026-08-10");
    expect(scheduledTaskId("payroll", d1, "daily")).not.toBe(scheduledTaskId("payroll", d2, "daily"));
  });

  it("hourly granularity separates runs within a day", () => {
    const d1 = new Date("2026-08-10T09:30:00Z");
    const d2 = new Date("2026-08-10T10:30:00Z");
    expect(scheduledTaskId("sweep", d1, "hourly")).toBe("sweep@2026-08-10T09");
    expect(scheduledTaskId("sweep", d1, "hourly")).not.toBe(scheduledTaskId("sweep", d2, "hourly"));
  });
});

describe("submission outcome classification", () => {
  it("flags idempotentReplay:true as replay", () => {
    expect(classifySubmissionResult({ executionId: "e1", idempotentReplay: true, raw: {} }).kind).toBe("replay");
    expect(classifySubmissionResult({ executionId: "e1", raw: {} }).kind).toBe("executed");
  });

  it("splits the two 409 codes and surfaces originalExecutionId", () => {
    const conflict = new KeeperHubIdempotencyConflictError(409, "idempotency_conflict", {}, "orig-1");
    const inProgress = new KeeperHubIdempotencyConflictError(409, "idempotency_in_progress", {}, undefined);
    expect(classifySubmissionError(conflict)).toMatchObject({ kind: "conflict", originalExecutionId: "orig-1" });
    expect(classifySubmissionError(inProgress)).toMatchObject({ kind: "in_progress" });
  });

  it("classifies pre-broadcast failures, so callers know nothing was sent", () => {
    expect(classifySubmissionError(new KeeperHubConfigError("no key"))).toMatchObject({ kind: "pre_broadcast" });
    expect(classifySubmissionError(new KeeperHubWireValidationError("/api/execute/transfer", new Error("bad")))).
      toMatchObject({ kind: "pre_broadcast" });
  });

  it("falls back to ambiguous — the fail-closed default — for everything else", () => {
    // An HTTP status or a bare transport error says nothing about whether a
    // broadcast landed, so neither may be treated as "nothing happened".
    expect(classifySubmissionError(new KeeperHubHttpError(500, undefined, {}))).toMatchObject({ kind: "ambiguous" });
    expect(classifySubmissionError(new Error("boom"))).toMatchObject({ kind: "ambiguous" });
  });

  it("does NOT treat a response-side parse failure as pre-broadcast", () => {
    // A zod error from parsing a RESPONSE happened after the request went out.
    const responseParseFailure = Object.assign(new Error("invalid response"), { name: "ZodError" });
    expect(classifySubmissionError(responseParseFailure)).toMatchObject({ kind: "ambiguous" });
  });
});
