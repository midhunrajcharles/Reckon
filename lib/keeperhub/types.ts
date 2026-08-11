/**
 * POST /api/execute/transfer — native/token transfer via the Direct Execution
 * API. Confirmed live 2026-08-08 (simulate:true against Base Sepolia): the
 * endpoint returns HTTP 200 with a synchronous result, not an executionId.
 *
 * `tokenAddress`/`tokenConfig` are per the confirmed body shape but their
 * exact use (ERC-20 transfers) hasn't been exercised live yet — passed
 * through as given, not validated beyond basic typing.
 */
export interface KeeperHubTransferInput {
  chainId: number;
  recipientAddress: `0x${string}`;
  /**
   * Plain decimal string, e.g. "0". Unit convention (wei vs. whole token)
   * is NOT confirmed beyond the zero-value case we've tested — do not
   * assume wei without checking against a non-zero live call first.
   */
  amount: string;
  tokenAddress?: `0x${string}`;
  tokenConfig?: Record<string, unknown>;
  /** e.g. 1.5 — encoded to `"1.5"` before sending. */
  gasLimitMultiplier?: number;
}

/**
 * Synchronous simulate response shape, confirmed live:
 * {"success":true,"status":"simulated","from":"0x...","to":"0x...","value":"0","gasEstimate":"21000","simulatedReturnValue":null,"wouldRevert":false}
 */
export interface KeeperHubTransferSimulationResult {
  success?: boolean;
  status?: string;
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: unknown;
  wouldRevert?: boolean;
  raw: unknown;
}

/**
 * POST /api/execute/contract-call — confirmed live 2026-08-08 via validation-
 * error probing. Field names on this surface do NOT match the workflow-
 * builder's web3/write-contract action: this is `functionName`, not
 * `abiFunction`. `abi`/`functionArgs` are JSON-encoded strings on both
 * surfaces, confirmed here by a successful (non-validation-error) call.
 *
 * Only fields actually observed are typed here. The workflow-builder surface
 * also has ethValue/failOnError/gasLimitMultiplier on write-contract, but
 * those have NOT been confirmed on this endpoint — do not assume they carry
 * over without checking.
 */
export interface KeeperHubContractCallInput {
  chainId: number;
  contractAddress: `0x${string}`;
  functionName: string;
  /** JSON-encoded ABI array string. Omit to rely on auto-fetch for verified contracts (confirmed: auto-fetch is attempted first, and fails loudly if the contract isn't verified). */
  abi?: string;
  /** JSON-encoded positional array string. */
  functionArgs?: string;
}

/** Real (non-simulate) execute response — shape not yet confirmed live; kept flexible. */
export interface KeeperHubExecutionResult {
  executionId?: string;
  transactionHash?: string;
  transactionLink?: string;
  /** Sponsored txs: `from` is the relayer, transfer is an internal call, won't appear in the EOA txlist. */
  sponsored?: boolean;
  status?: string;
  /** True when KeeperHub answered from its 24h replay cache — no new broadcast happened. */
  idempotentReplay?: boolean;
  raw: unknown;
}

/** GET /api/execute/{executionId}/status */
export interface KeeperHubExecutionStatus {
  status: string;
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  raw: unknown;
}
