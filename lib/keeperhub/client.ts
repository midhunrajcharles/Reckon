import { sleep } from "../sleep";
import { type KeeperHubConfig, loadKeeperHubConfig } from "./config";
import { encodeGasLimitMultiplier } from "./encode";
import { KeeperHubConfigError, KeeperHubWireValidationError } from "./errors";
import { keeperHubFetch } from "./http";
import { keeperHubContractCallWireSchema, keeperHubTransferWireSchema, keeperHubUserResponseSchema } from "./schemas";
import type {
  KeeperHubContractCallInput,
  KeeperHubExecutionResult,
  KeeperHubExecutionStatus,
  KeeperHubTransferInput,
  KeeperHubTransferSimulationResult,
} from "./types";

// Direct Execution API — confirmed live 2026-08-08. This is a separate,
// simpler REST surface from the workflow-builder's action catalog
// (GET /api/mcp/schemas, used by POST /api/workflows/create): one call, no
// workflow graph. The two surfaces do NOT share a wire format — confirmed by
// testing both: the workflow-builder's web3/write-contract action uses
// `abiFunction`, this surface uses `functionName` for the same concept.
const ENDPOINTS = {
  keys: "/api/keys",
  user: "/api/user",
  executeTransfer: "/api/execute/transfer",
  executeContractCall: "/api/execute/contract-call",
  executeStatus: (executionId: string) => `/api/execute/${executionId}/status`,
} as const;

/** How long an execution may stay non-terminal before we stop polling it. */
const EXECUTION_POLL_TIMEOUT_MS = 90_000;

/**
 * Last-line defense: validate an encoded wire body right before it goes out,
 * so an encode-step bug fails loudly here instead of as a silent KeeperHub
 * 422. The typed error is what marks the failure as pre-broadcast — nothing
 * was sent, so callers may safely treat the request as never having happened.
 */
function parseWire<T>(schema: { parse(value: unknown): T }, wire: unknown, endpoint: string): T {
  try {
    return schema.parse(wire);
  } catch (err) {
    throw new KeeperHubWireValidationError(endpoint, err);
  }
}

function parseExecutionResult(raw: Record<string, unknown>): KeeperHubExecutionResult {
  return {
    executionId: typeof raw.executionId === "string" ? raw.executionId : undefined,
    transactionHash: typeof raw.transactionHash === "string" ? raw.transactionHash : undefined,
    transactionLink: typeof raw.transactionLink === "string" ? raw.transactionLink : undefined,
    sponsored: typeof raw.sponsored === "boolean" ? raw.sponsored : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    idempotentReplay: typeof raw.idempotentReplay === "boolean" ? raw.idempotentReplay : undefined,
    raw,
  };
}

export class KeeperHubClient {
  private readonly config: KeeperHubConfig;

  constructor(config?: KeeperHubConfig) {
    this.config = config ?? loadKeeperHubConfig();
  }

  /**
   * GET /api/keys — the documented auth probe. Resolves iff the key is valid
   * and org-scoped (HTTP 200); throws a typed error otherwise (see errors.ts,
   * including the Cloudflare-vs-KeeperHub 403 disambiguation).
   */
  async getKeys(): Promise<{ ok: true; raw: unknown }> {
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.keys);
    return { ok: true, raw: data };
  }

  /**
   * GET /api/user — walletAddress is the **org wallet**, never the sign-in
   * address. Provisioning is async: `null` means pending, not an error.
   */
  async getUser(): Promise<{ walletAddress: `0x${string}` | null; raw: unknown }> {
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.user);
    const parsed = keeperHubUserResponseSchema.parse(data);
    return { walletAddress: parsed.walletAddress as `0x${string}` | null, raw: data };
  }

  /** Polls GET /api/user until walletAddress is provisioned. */
  async waitForOrgWallet(opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<`0x${string}`> {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const intervalMs = opts.intervalMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const { walletAddress } = await this.getUser();
      if (walletAddress) return walletAddress;
      if (Date.now() >= deadline) {
        throw new KeeperHubConfigError(
          `Org wallet still not provisioned after ${timeoutMs}ms — GET /api/user keeps returning walletAddress: null.`,
        );
      }
      await sleep(intervalMs);
    }
  }

  private buildTransferWireBody(input: KeeperHubTransferInput, simulate: boolean) {
    const wire = {
      chainId: input.chainId,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      tokenAddress: input.tokenAddress,
      tokenConfig: input.tokenConfig,
      gasLimitMultiplier:
        input.gasLimitMultiplier !== undefined ? encodeGasLimitMultiplier(input.gasLimitMultiplier) : undefined,
      simulate,
    };
    return parseWire(keeperHubTransferWireSchema, wire, ENDPOINTS.executeTransfer);
  }

  /**
   * POST /api/execute/transfer with simulate: true (a real boolean — callers
   * cannot override it through this method). Confirmed live: returns HTTP 200
   * with a synchronous result body (success/status/from/to/value/gasEstimate/
   * wouldRevert), not an executionId to poll.
   */
  async simulateTransfer(input: KeeperHubTransferInput): Promise<KeeperHubTransferSimulationResult> {
    const wire = this.buildTransferWireBody(input, true);
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.executeTransfer, { method: "POST", body: wire });
    const raw = data as Record<string, unknown>;
    return {
      success: typeof raw.success === "boolean" ? raw.success : undefined,
      status: typeof raw.status === "string" ? raw.status : undefined,
      from: typeof raw.from === "string" ? raw.from : undefined,
      to: typeof raw.to === "string" ? raw.to : undefined,
      value: typeof raw.value === "string" ? raw.value : undefined,
      gasEstimate: typeof raw.gasEstimate === "string" ? raw.gasEstimate : undefined,
      simulatedReturnValue: raw.simulatedReturnValue,
      wouldRevert: typeof raw.wouldRevert === "boolean" ? raw.wouldRevert : undefined,
      raw,
    };
  }

  /**
   * POST /api/execute/transfer with simulate: false. This is a real
   * broadcast — callers must gate this behind explicit user confirmation.
   *
   * Pass `idempotencyKey` (see lib/idempotency) to make a duplicate submission
   * replay the original execution instead of broadcasting twice.
   */
  async executeTransfer(
    input: KeeperHubTransferInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<KeeperHubExecutionResult> {
    const wire = this.buildTransferWireBody(input, false);
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.executeTransfer, {
      method: "POST",
      body: wire,
      idempotencyKey: opts.idempotencyKey,
    });
    return parseExecutionResult(data as Record<string, unknown>);
  }

  private buildContractCallWireBody(input: KeeperHubContractCallInput, simulate: boolean) {
    const wire = {
      chainId: input.chainId,
      contractAddress: input.contractAddress,
      functionName: input.functionName,
      abi: input.abi,
      functionArgs: input.functionArgs,
      simulate,
    };
    return parseWire(keeperHubContractCallWireSchema, wire, ENDPOINTS.executeContractCall);
  }

  /** POST /api/execute/contract-call with simulate: true. See KeeperHubContractCallInput for what's confirmed vs. not. */
  async simulateContractCall(input: KeeperHubContractCallInput): Promise<{ wouldRevert?: boolean; raw: unknown }> {
    const wire = this.buildContractCallWireBody(input, true);
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.executeContractCall, {
      method: "POST",
      body: wire,
    });
    const raw = data as Record<string, unknown>;
    return { wouldRevert: typeof raw.wouldRevert === "boolean" ? raw.wouldRevert : undefined, raw };
  }

  /** POST /api/execute/contract-call with simulate: false. Real broadcast — gate behind explicit confirmation. */
  async callContract(
    input: KeeperHubContractCallInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<KeeperHubExecutionResult> {
    const wire = this.buildContractCallWireBody(input, false);
    const { data } = await keeperHubFetch(this.config, ENDPOINTS.executeContractCall, {
      method: "POST",
      body: wire,
      idempotencyKey: opts.idempotencyKey,
    });
    return parseExecutionResult(data as Record<string, unknown>);
  }

  /** GET /api/execute/{executionId}/status. Honours X-Poll-Interval-Hint (0 = terminal). */
  async getExecutionStatus(
    executionId: string,
  ): Promise<KeeperHubExecutionStatus & { pollIntervalHintSeconds?: number; terminal: boolean }> {
    const { data, meta } = await keeperHubFetch(this.config, ENDPOINTS.executeStatus(executionId));
    const parsed = parseExecutionResult(data as Record<string, unknown>);
    return {
      ...parsed,
      status: parsed.status ?? "unknown",
      pollIntervalHintSeconds: meta.pollIntervalHintSeconds,
      terminal: meta.pollIntervalIsTerminal ?? false,
    };
  }

  /**
   * Polls getExecutionStatus to the terminal state, honouring the
   * X-Poll-Interval-Hint header. The one place the poll policy lives.
   *
   * Bounded: an execution that never reaches terminal returns the last status
   * seen rather than looping forever. The caller then verifies against the
   * chain like any other inconclusive report — a stuck poll must not wedge the
   * standing worker.
   */
  async waitForExecution(
    executionId: string,
  ): Promise<KeeperHubExecutionStatus & { pollIntervalHintSeconds?: number; terminal: boolean }> {
    const deadline = Date.now() + EXECUTION_POLL_TIMEOUT_MS;
    for (;;) {
      const status = await this.getExecutionStatus(executionId);
      const remaining = deadline - Date.now();
      if (status.terminal || remaining <= 0) return status;
      // Clamped, or a large poll hint would overshoot the bound it exists to enforce.
      await sleep(Math.min((status.pollIntervalHintSeconds ?? 3) * 1000, remaining));
    }
  }
}
