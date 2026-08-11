import {
  AGENT_STATUSES,
  classifyReportedStatus,
  classifySubmissionError,
  classifySubmissionResult,
  computeIdempotencyKey,
  KeeperHubClient,
  KeeperHubSimulationRevertError,
  type KeeperHubTransferInput,
} from "lib";
import {
  beginAttempt,
  createIntent,
  listAttempts,
  recordSubmission,
  RetryBlockedError,
  type Attempt,
  type Intent,
} from "db";
import { makeIndependentClient } from "./chain";
import { critiqueAttempt } from "./critique";
import type { ReceiptReader } from "./observe";
import type { ReconcileVerdict } from "lib";

export interface RunIntentInput {
  taskId: string;
  chainId: number;
  recipientAddress: `0x${string}`;
  amount: string;
  tokenAddress?: `0x${string}`;
  trigger?: string;
  /** Gas bid, e.g. 1.5. Recorded on the attempt and sent to the API. */
  gasLimitMultiplier?: number;
  /**
   * Chaos hook: pretend the platform reported this status instead of what it
   * actually said. Forces the reported/verified mismatch with ONE real
   * transaction — the injection is recorded on the attempt's trigger.
   */
  injectReportedStatus?: string;
}

export interface RunIntentOutcome {
  intent: Intent;
  attempt: Attempt;
  verdict: ReconcileVerdict;
  executionId?: string;
  transactionHash?: string;
}

/**
 * One full pass: gate → simulate → broadcast → record → critique. Throws
 * RetryBlockedError before ANY network call when a discrepancy has blocked
 * the intent — the ledger, not executor politeness, prevents the double-spend.
 */
export interface RunIntentOpts {
  /** Override the independent chain reader — regression tests inject fakes here. */
  reader?: ReceiptReader;
}

export async function runIntentOnce(
  client: KeeperHubClient,
  input: RunIntentInput,
  opts: RunIntentOpts = {},
): Promise<RunIntentOutcome> {
  const keyInput = {
    taskId: input.taskId,
    chainId: input.chainId,
    recipientAddress: input.recipientAddress,
    amount: input.amount,
    tokenAddress: input.tokenAddress,
  };
  // Throws on malformed addresses/amounts — strict validation BEFORE any
  // ledger write, so bad input never leaves an orphan intent row.
  const idempotencyKey = computeIdempotencyKey(keyInput);

  const intent = await createIntent(keyInput);

  // Refuse a blocked intent before ANY KeeperHub call, including simulation.
  // createIntent returns the existing row on taskId collision, so this flag
  // is current; beginAttempt still re-checks inside its transaction — this
  // is an optimisation, that is the guarantee.
  if (intent.retryBlocked) throw new RetryBlockedError(intent.id, intent.blockedReason);

  const transfer: KeeperHubTransferInput = {
    chainId: input.chainId,
    recipientAddress: input.recipientAddress,
    amount: input.amount,
    tokenAddress: input.tokenAddress,
    gasLimitMultiplier: input.gasLimitMultiplier,
  };

  // Simulation is free and gives the attempt row its evidence.
  let simulation: { wouldRevert?: boolean; gasEstimate?: string; raw: unknown };
  try {
    simulation = await client.simulateTransfer(transfer);
  } catch (err) {
    if (err instanceof KeeperHubSimulationRevertError) {
      simulation = { wouldRevert: true, gasEstimate: undefined, raw: err.body };
    } else {
      throw err;
    }
  }

  const priorAttempts = await listAttempts(intent.id);
  const trigger = input.injectReportedStatus
    ? `${input.trigger ?? "chaos"}:inject_reported_${input.injectReportedStatus}`
    : (input.trigger ?? (priorAttempts.length === 0 ? "initial" : "retry"));

  // The gate. RetryBlockedError from here means a discrepancy is open and
  // this intent must not produce a second transaction.
  const attempt = await beginAttempt({
    intentId: intent.id,
    retryNumber: priorAttempts.length,
    trigger,
    idempotencyKey,
    simulationWouldRevert: simulation.wouldRevert,
    simulationGasEstimate: simulation.gasEstimate,
    simulationRaw: simulation.raw,
    gasLimitMultiplier:
      input.gasLimitMultiplier !== undefined ? String(input.gasLimitMultiplier) : undefined,
  });

  if (simulation.wouldRevert) {
    throw new Error(`Simulation would revert for intent ${intent.id} — refusing to broadcast.`);
  }

  // Real broadcast. The key rides the Idempotency-Key header (see the client),
  // so a duplicate submission replays the original execution at the platform
  // instead of broadcasting twice — the second layer under the ledger's block.
  let executionId: string | undefined;
  let reportedStatus: string | undefined;
  let transactionHash: string | undefined;
  let idempotentReplay = false;
  // A pre-broadcast failure is surfaced, but only AFTER the attempt is closed
  // out below — an escaping throw would skip recordSubmission and strand the
  // intent in `executing`, a status no loop selects for.
  let preBroadcastError: unknown;
  try {
    const result = await client.executeTransfer(transfer, { idempotencyKey });
    executionId = result.executionId;
    idempotentReplay = classifySubmissionResult(result).kind === "replay";
    reportedStatus = result.status;
    transactionHash = result.transactionHash;
  } catch (err) {
    const outcome = classifySubmissionError(err);
    switch (outcome.kind) {
      case "in_progress":
        reportedStatus = AGENT_STATUSES.inProgress;
        break;
      case "conflict":
        executionId = outcome.originalExecutionId;
        reportedStatus = AGENT_STATUSES.idempotencyConflict;
        break;
      case "pre_broadcast":
        // Nothing reached the network. Reported as a plain failure with no
        // hash, so critiqueAttempt reaches `retryable_failure` through the
        // same reconcile matrix as any other no-broadcast failure — the
        // executor gains no private authority over the ledger.
        reportedStatus = "failed";
        preBroadcastError = outcome.error;
        break;
      default:
        // Ambiguous: the submission may have broadcast before this error.
        // Record it and let the chain, not this failure, decide.
        reportedStatus = AGENT_STATUSES.submissionError;
    }
  }

  // Poll to terminal if we have an executionId and no decisive answer yet.
  // One vocabulary for "decisive": lib's classifyReportedStatus.
  if (executionId && classifyReportedStatus(reportedStatus) === "unknown") {
    try {
      const status = await client.waitForExecution(executionId);
      reportedStatus = status.status;
      transactionHash = status.transactionHash ?? transactionHash;
    } catch {
      // The status poll failed; any hash from the submission still stands.
      // Verification runs on what we have — a failed poll is not a verdict.
      reportedStatus = AGENT_STATUSES.statusPollFailed;
    }
  }

  const submitted = await recordSubmission(attempt.id, intent.id, {
    executionId: executionId ?? null,
    reportedStatus: input.injectReportedStatus ?? reportedStatus ?? null,
    reportedTxHash: transactionHash ?? null,
    idempotentReplay,
  });

  // The critique agent takes over: independent RPC, fail closed, block on mismatch.
  const reader = opts.reader ?? makeIndependentClient(input.chainId);
  const verdict = await critiqueAttempt(submitted, reader);

  // The attempt is closed and the intent is back to `pending`; now surface it.
  if (preBroadcastError) throw preBroadcastError;

  return { intent, attempt: submitted, verdict, executionId, transactionHash };
}

export interface GasSpikeOutcome {
  refusedAttemptId: string;
  recovery: RunIntentOutcome;
}

/**
 * Chaos scenario: escalation and recovery. Attempt #0's gas bid is refused by
 * an INJECTED spike — labelled on the trigger, never broadcast, no hash, so
 * nothing on chain is fabricated. Attempt #1 escalates the bid, broadcasts for
 * real, and settles off an independent receipt.
 */
export async function runGasSpikeScenario(
  client: KeeperHubClient,
  input: Omit<RunIntentInput, "trigger" | "injectReportedStatus" | "gasLimitMultiplier">,
): Promise<GasSpikeOutcome> {
  const keyInput = {
    taskId: input.taskId,
    chainId: input.chainId,
    recipientAddress: input.recipientAddress,
    amount: input.amount,
    tokenAddress: input.tokenAddress,
  };
  // Same guarantee as runIntentOnce: validate before any ledger write.
  const idempotencyKey = computeIdempotencyKey(keyInput);

  const intent = await createIntent(keyInput);
  if (intent.retryBlocked) throw new RetryBlockedError(intent.id, intent.blockedReason);

  const simulation = await client.simulateTransfer({
    chainId: input.chainId,
    recipientAddress: input.recipientAddress,
    amount: input.amount,
    tokenAddress: input.tokenAddress,
  });

  // The refused bid. Submission never happens — the spike kills it first.
  const refused = await beginAttempt({
    intentId: intent.id,
    retryNumber: 0,
    trigger: "chaos:inject_gas_spike_bid_refused",
    idempotencyKey,
    simulationWouldRevert: simulation.wouldRevert,
    simulationGasEstimate: simulation.gasEstimate,
    simulationRaw: simulation.raw,
    gasLimitMultiplier: "1.0",
  });
  const refusedSubmitted = await recordSubmission(refused.id, intent.id, {
    executionId: null,
    reportedStatus: "failed",
    reportedTxHash: null,
    idempotentReplay: false,
  });
  await critiqueAttempt(refusedSubmitted, makeIndependentClient(input.chainId));

  // Escalated bid, real broadcast, real receipt.
  const recovery = await runIntentOnce(client, {
    ...input,
    trigger: "retry:gas_escalated",
    gasLimitMultiplier: 1.5,
  });

  return { refusedAttemptId: refused.id, recovery };
}

export { RetryBlockedError };
