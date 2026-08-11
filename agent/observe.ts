import type { ChainObservation } from "lib";

/** The slice of a viem PublicClient the observer needs — injectable for tests. */
export interface ReceiptReader {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: "success" | "reverted" } & Record<string, unknown>>;
  getTransaction(args: { hash: `0x${string}` }): Promise<unknown>;
}

export interface ObserveOptions {
  /** Total budget before failing closed. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.name === "TransactionReceiptNotFoundError";
}

/**
 * Fetch chain truth for a hash with our own RPC. Distinguishes the two
 * fail-closed outcomes: `not_found` (chain has no trace of the tx) vs
 * `timeout` (tx known but unmined, or the RPC would not answer). Both park
 * the intent as unverified — neither ever settles it.
 */
export async function observeTransaction(
  reader: ReceiptReader,
  txHash: string | null | undefined,
  opts: ObserveOptions = {},
): Promise<{ observation: ChainObservation; receipt?: Record<string, unknown> }> {
  if (!txHash) return { observation: { kind: "no_hash" } };
  const hash = txHash as `0x${string}`;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;

  for (;;) {
    try {
      const receipt = await reader.getTransactionReceipt({ hash });
      return { observation: { kind: "receipt", status: receipt.status }, receipt };
    } catch (err) {
      if (!isNotFoundError(err)) {
        // RPC/network failure — fail closed as timeout, never guess.
        return { observation: { kind: "timeout" } };
      }
    }
    if (now() >= deadline) break;
    await sleep(pollIntervalMs);
  }

  // No receipt within budget. One last read to tell "pending" from "no trace".
  try {
    const tx = await reader.getTransaction({ hash });
    return { observation: tx ? { kind: "timeout" } : { kind: "not_found" } };
  } catch {
    return { observation: { kind: "not_found" } };
  }
}
