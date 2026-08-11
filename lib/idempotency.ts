import { createHash } from "node:crypto";
import {
  isPreBroadcastError,
  KeeperHubIdempotencyConflictError,
  type KeeperHubPreBroadcastError,
} from "./keeperhub/errors";
import type { KeeperHubExecutionResult } from "./keeperhub/types";

/**
 * The documented stable-key recipe, implemented exactly:
 * `taskId|chainId|recipientAddress|amount|tokenAddress` — pipe-separated,
 * addresses lowercased, chainId as decimal, amount canonicalised to a plain
 * decimal string, then SHA-256 hex. Native transfers use an empty string in
 * the tokenAddress slot (the trailing pipe stays, so native and token keys
 * can never collide on the same material).
 */
export interface IdempotencyKeyInput {
  /** Scheduled jobs MUST bake the period into taskId — see scheduledTaskId(). */
  taskId: string;
  chainId: number;
  recipientAddress: string;
  amount: string;
  /** Omit for native transfers. */
  tokenAddress?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT_RE = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Canonicalises an amount to a plain decimal string: no exponents, no leading
 * or trailing zeros ("00.500" → "0.5", "1e18" → "1000000000000000000").
 * String arithmetic throughout — floats would corrupt 18-decimal amounts.
 */
export function canonicalAmount(input: string): string {
  const trimmed = input.trim();
  if (!AMOUNT_RE.test(trimmed)) {
    throw new Error(`Amount ${JSON.stringify(input)} is not a plain non-negative decimal number`);
  }

  const [mantissa, expPart] = trimmed.split(/[eE]/);
  const exponent = expPart === undefined ? 0 : Number.parseInt(expPart, 10);
  const [rawInt = "", rawFrac = ""] = mantissa.split(".");

  const digits = rawInt + rawFrac;
  let pointPos = rawInt.length + exponent;

  let intPart: string;
  let fracPart: string;
  if (pointPos <= 0) {
    intPart = "0";
    fracPart = "0".repeat(-pointPos) + digits;
  } else if (pointPos >= digits.length) {
    intPart = digits + "0".repeat(pointPos - digits.length);
    fracPart = "";
  } else {
    intPart = digits.slice(0, pointPos);
    fracPart = digits.slice(pointPos);
  }

  intPart = intPart.replace(/^0+(?=\d)/, "");
  fracPart = fracPart.replace(/0+$/, "");
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
}

function canonicalAddress(address: string, label: string): string {
  if (!ADDRESS_RE.test(address)) {
    throw new Error(`${label} ${JSON.stringify(address)} is not a 0x-prefixed 20-byte hex address`);
  }
  return address.toLowerCase();
}

/** The exact preimage string — exported so tests (and humans) can inspect it. */
export function idempotencyKeyMaterial(input: IdempotencyKeyInput): string {
  if (!Number.isInteger(input.chainId) || input.chainId <= 0) {
    throw new Error(`chainId ${input.chainId} must be a positive integer`);
  }
  if (input.taskId.includes("|")) {
    throw new Error(`taskId ${JSON.stringify(input.taskId)} must not contain the pipe separator`);
  }
  return [
    input.taskId,
    String(input.chainId),
    canonicalAddress(input.recipientAddress, "recipientAddress"),
    canonicalAmount(input.amount),
    input.tokenAddress === undefined ? "" : canonicalAddress(input.tokenAddress, "tokenAddress"),
  ].join("|");
}

export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  return createHash("sha256").update(idempotencyKeyMaterial(input), "utf8").digest("hex");
}

/**
 * Scheduled jobs must include the period in taskId or keys collide across
 * KeeperHub's 24-hour replay window. Truncates the period start to the
 * granularity so every run in the same period agrees on the same taskId.
 */
export function scheduledTaskId(baseTaskId: string, periodStart: Date, granularity: "hourly" | "daily"): string {
  const iso = periodStart.toISOString();
  const period = granularity === "hourly" ? iso.slice(0, 13) : iso.slice(0, 10);
  return `${baseTaskId}@${period}`;
}

/** Every way a submission can come back. */
export type SubmissionOutcome =
  | { kind: "executed"; executionId?: string; result: KeeperHubExecutionResult }
  /** KeeperHub answered from its replay cache — same execution, no new broadcast. */
  | { kind: "replay"; executionId?: string; result: KeeperHubExecutionResult }
  /** Same key, different payload — a bug or a collision. Never retry blindly. */
  | { kind: "conflict"; originalExecutionId?: string; error: KeeperHubIdempotencyConflictError }
  /** First submission still in flight — poll, don't resubmit. */
  | { kind: "in_progress"; error: KeeperHubIdempotencyConflictError }
  /** Failed before anything could reach the network — nothing was broadcast. */
  | { kind: "pre_broadcast"; error: KeeperHubPreBroadcastError }
  /**
   * Anything else: an HTTP status, a transport error, a timeout. A broadcast
   * MAY have happened. This is the fail-closed case — never treat it as
   * "nothing happened" and free the intent for a retry.
   */
  | { kind: "ambiguous"; error: unknown };

export function classifySubmissionResult(result: KeeperHubExecutionResult): SubmissionOutcome {
  // parseExecutionResult is the sole lifter of idempotentReplay — trust it.
  return result.idempotentReplay === true
    ? { kind: "replay", executionId: result.executionId, result }
    : { kind: "executed", executionId: result.executionId, result };
}

/**
 * Total: every thrown submission failure gets a kind. Deliberately exhaustive
 * so the safety-critical default is a decision made here, in one place, rather
 * than an untyped `else` at each call site — a new error class inherits
 * `ambiguous` (fail closed), which is the safe direction.
 */
export function classifySubmissionError(error: unknown): SubmissionOutcome {
  if (error instanceof KeeperHubIdempotencyConflictError) {
    return error.code === "idempotency_in_progress"
      ? { kind: "in_progress", error }
      : { kind: "conflict", originalExecutionId: error.originalExecutionId, error };
  }
  if (isPreBroadcastError(error)) return { kind: "pre_broadcast", error };
  return { kind: "ambiguous", error };
}
