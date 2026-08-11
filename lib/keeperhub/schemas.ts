import { isAddress } from "viem";
import { z } from "zod";

function isJsonArrayString(value: string): boolean {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

const evmAddress = z.string().refine(isAddress, { message: "must be a valid 0x-prefixed EVM address" });

const simulateField = z.boolean({
  invalid_type_error:
    'simulate must be a strict JSON boolean — the string "true" is rejected by KeeperHub by design, ' +
    "to stop silent fall-through to a real broadcast",
});

const gasLimitMultiplierField = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'gasLimitMultiplier must be a numeric string, e.g. "1.5", not a JS number')
  .optional();

/**
 * Wire-level shape for POST /api/execute/transfer, confirmed live 2026-08-08.
 * Last-line defense: `KeeperHubClient` builds this from natively-typed input,
 * and we validate the encoded result right before it goes over the wire, so
 * an encode-step bug fails loudly here instead of as a silent KeeperHub 422.
 */
export const keeperHubTransferWireSchema = z.object({
  chainId: z.number().int().positive(),
  recipientAddress: evmAddress,
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'amount must be a plain decimal string (e.g. "0"), not a number or exponent form'),
  tokenAddress: evmAddress.optional(),
  tokenConfig: z.record(z.string(), z.unknown()).optional(),
  gasLimitMultiplier: gasLimitMultiplierField,
  simulate: simulateField,
});
export type KeeperHubTransferWire = z.infer<typeof keeperHubTransferWireSchema>;

/**
 * Wire-level shape for POST /api/execute/contract-call, confirmed live
 * 2026-08-08 via validation-error probing: `functionName` (not `abiFunction`
 * — that's the workflow-builder's field name for the same concept, a
 * different API surface). `abi`/`functionArgs` are JSON-encoded strings,
 * confirmed by a successful (past-validation) call.
 */
export const keeperHubContractCallWireSchema = z.object({
  chainId: z.number().int().positive(),
  contractAddress: evmAddress,
  functionName: z.string().min(1),
  abi: z
    .string()
    .min(2)
    .refine(isJsonArrayString, "abi must be a JSON-stringified array (JSON.stringify(abi)), not a JS array")
    .optional(),
  functionArgs: z
    .string()
    .refine(isJsonArrayString, "functionArgs must be a JSON-stringified positional array (JSON.stringify(args))")
    .optional(),
  simulate: simulateField,
});
export type KeeperHubContractCallWire = z.infer<typeof keeperHubContractCallWireSchema>;

/** GET /api/user response — walletAddress is the org wallet; null means provisioning is still pending. */
export const keeperHubUserResponseSchema = z
  .object({
    walletAddress: z.union([evmAddress, z.null()]),
  })
  .passthrough();
export type KeeperHubUserResponse = z.infer<typeof keeperHubUserResponseSchema>;
