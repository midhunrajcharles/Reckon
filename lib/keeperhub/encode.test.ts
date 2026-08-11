import { describe, expect, it } from "vitest";
import { encodeAbiForKeeperHub, encodeFunctionArgsForKeeperHub, encodeGasLimitMultiplier } from "./encode";
import { KeeperHubConfigError } from "./errors";

describe("encodeAbiForKeeperHub", () => {
  it("produces a JSON array string from an Abi array", () => {
    const abi = [{ type: "function", name: "transfer", inputs: [], outputs: [], stateMutability: "nonpayable" }] as const;
    const encoded = encodeAbiForKeeperHub(abi as never);
    expect(typeof encoded).toBe("string");
    expect(JSON.parse(encoded)).toEqual(abi);
  });
});

describe("encodeFunctionArgsForKeeperHub", () => {
  it("produces a JSON positional-array string", () => {
    const encoded = encodeFunctionArgsForKeeperHub(["0xabc", 100n.toString()]);
    expect(JSON.parse(encoded)).toEqual(["0xabc", "100"]);
  });

  it("encodes an empty args list as []", () => {
    expect(encodeFunctionArgsForKeeperHub([])).toBe("[]");
  });
});

describe("encodeGasLimitMultiplier", () => {
  it("stringifies a positive number", () => {
    expect(encodeGasLimitMultiplier(1.5)).toBe("1.5");
  });

  it("rejects zero and negative multipliers", () => {
    expect(() => encodeGasLimitMultiplier(0)).toThrow(KeeperHubConfigError);
    expect(() => encodeGasLimitMultiplier(-1)).toThrow(KeeperHubConfigError);
  });

  it("rejects non-finite values", () => {
    expect(() => encodeGasLimitMultiplier(Number.NaN)).toThrow(KeeperHubConfigError);
    expect(() => encodeGasLimitMultiplier(Number.POSITIVE_INFINITY)).toThrow(KeeperHubConfigError);
  });
});
