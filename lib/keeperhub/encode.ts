import type { Abi } from "viem";
import { KeeperHubConfigError } from "./errors";

/**
 * KeeperHub wants `abi` as a JSON string, not a JS array — wrong type 422s
 * silently. Confirmed on both the workflow-builder surface and
 * POST /api/execute/contract-call. Callers pass a real `Abi`; this is the
 * only place that stringifies it.
 */
export function encodeAbiForKeeperHub(abi: Abi): string {
  return JSON.stringify(abi);
}

/** `functionArgs` is a JSON-stringified *positional* array, not the raw JS array. */
export function encodeFunctionArgsForKeeperHub(args: readonly unknown[]): string {
  return JSON.stringify(args);
}

/** `gasLimitMultiplier` is a string on the wire (e.g. `"1.5"`), not a JS number. */
export function encodeGasLimitMultiplier(multiplier: number): string {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new KeeperHubConfigError(`gasLimitMultiplier must be a positive finite number, got ${multiplier}.`);
  }
  return String(multiplier);
}
