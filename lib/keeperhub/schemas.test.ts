import { describe, expect, it } from "vitest";
import { keeperHubContractCallWireSchema, keeperHubTransferWireSchema, keeperHubUserResponseSchema } from "./schemas";

const validTransfer = {
  chainId: 84532,
  recipientAddress: "0x000000000000000000000000000000000000dEaD",
  amount: "0",
  simulate: true,
};

describe("keeperHubTransferWireSchema", () => {
  it("accepts a correctly-shaped transfer body (POST /api/execute/transfer)", () => {
    expect(() => keeperHubTransferWireSchema.parse(validTransfer)).not.toThrow();
  });

  it("rejects simulate as the string \"true\" — the documented 400 footgun", () => {
    expect(() => keeperHubTransferWireSchema.parse({ ...validTransfer, simulate: "true" })).toThrow();
  });

  it("rejects a malformed recipientAddress", () => {
    expect(() => keeperHubTransferWireSchema.parse({ ...validTransfer, recipientAddress: "not-an-address" })).toThrow();
  });

  it("rejects an amount with an exponent form", () => {
    expect(() => keeperHubTransferWireSchema.parse({ ...validTransfer, amount: "1e18" })).toThrow();
  });

  it("accepts a decimal amount (unit convention beyond zero is unconfirmed, but the shape must allow it)", () => {
    expect(() => keeperHubTransferWireSchema.parse({ ...validTransfer, amount: "0.1" })).not.toThrow();
  });

  it("rejects gasLimitMultiplier as a JS number instead of a numeric string", () => {
    expect(() => keeperHubTransferWireSchema.parse({ ...validTransfer, gasLimitMultiplier: 1.5 })).toThrow();
  });

  it("accepts an optional tokenAddress", () => {
    expect(() =>
      keeperHubTransferWireSchema.parse({
        ...validTransfer,
        tokenAddress: "0x000000000000000000000000000000000000dEaD",
      }),
    ).not.toThrow();
  });
});

const validContractCall = {
  chainId: 84532,
  contractAddress: "0x000000000000000000000000000000000000dEaD",
  functionName: "balanceOf",
  simulate: true,
};

describe("keeperHubContractCallWireSchema", () => {
  it("accepts a correctly-shaped contract-call body with functionName (not abiFunction)", () => {
    expect(() => keeperHubContractCallWireSchema.parse(validContractCall)).not.toThrow();
  });

  it("rejects abi as a raw JS array instead of a JSON string", () => {
    expect(() =>
      keeperHubContractCallWireSchema.parse({ ...validContractCall, abi: [{ type: "function", name: "balanceOf" }] }),
    ).toThrow();
  });

  it("rejects functionArgs as a raw JS array instead of a JSON string", () => {
    expect(() => keeperHubContractCallWireSchema.parse({ ...validContractCall, functionArgs: [] })).toThrow();
  });

  it("accepts abi/functionArgs as JSON-encoded strings", () => {
    expect(() =>
      keeperHubContractCallWireSchema.parse({
        ...validContractCall,
        abi: JSON.stringify([{ type: "function", name: "balanceOf", inputs: [], outputs: [] }]),
        functionArgs: JSON.stringify(["0xabc"]),
      }),
    ).not.toThrow();
  });

  it("rejects simulate as the string \"true\"", () => {
    expect(() => keeperHubContractCallWireSchema.parse({ ...validContractCall, simulate: "true" })).toThrow();
  });
});

describe("keeperHubUserResponseSchema", () => {
  it("accepts a null walletAddress (provisioning pending)", () => {
    expect(() => keeperHubUserResponseSchema.parse({ walletAddress: null })).not.toThrow();
  });

  it("accepts a valid address", () => {
    expect(() =>
      keeperHubUserResponseSchema.parse({ walletAddress: "0x000000000000000000000000000000000000dEaD" }),
    ).not.toThrow();
  });

  it("rejects a malformed address rather than silently passing it through", () => {
    expect(() => keeperHubUserResponseSchema.parse({ walletAddress: "0xnope" })).toThrow();
  });
});
