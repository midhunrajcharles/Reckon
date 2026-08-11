/**
 * Shared fixtures for the regression tests that run against the REAL ledger.
 * Both of them need the same two things: a KeeperHub client stub that counts
 * broadcasts, and a teardown that deletes a task's rows in FK order. Keeping
 * one copy matters most for the teardown — the delete order has to track the
 * schema, and two hand-written cascades drift (they already had).
 */
import { inArray } from "drizzle-orm";
import type { KeeperHubClient } from "lib";
import { attempts, discrepancies, getDb, intents, receipts } from "db";

export interface StubCalls {
  simulate: number;
  execute: number;
}

/**
 * A client whose simulation always passes, so the test controls only what the
 * broadcast does. `execute` either returns a result or throws.
 */
export function stubClient(execute: () => Promise<Record<string, unknown>>): {
  client: KeeperHubClient;
  calls: StubCalls;
} {
  const calls: StubCalls = { simulate: 0, execute: 0 };
  const client = {
    simulateTransfer: async () => {
      calls.simulate += 1;
      return { wouldRevert: false, gasEstimate: "21000", raw: { stub: true } };
    },
    executeTransfer: async () => {
      calls.execute += 1;
      return execute();
    },
    getExecutionStatus: async () => {
      throw new Error("status polling not expected in this scenario");
    },
  } as unknown as KeeperHubClient;
  return { client, calls };
}

/** Deletes every row belonging to these taskIds, children first. */
export async function cleanupTaskIds(taskIds: string[]): Promise<void> {
  const db = getDb();
  const rows = await db.select({ id: intents.id }).from(intents).where(inArray(intents.taskId, taskIds));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  const atts = await db.select({ id: attempts.id }).from(attempts).where(inArray(attempts.intentId, ids));
  const attIds = atts.map((a) => a.id);

  await db.delete(discrepancies).where(inArray(discrepancies.intentId, ids));
  if (attIds.length > 0) await db.delete(receipts).where(inArray(receipts.attemptId, attIds));
  await db.delete(attempts).where(inArray(attempts.intentId, ids));
  await db.delete(intents).where(inArray(intents.id, ids));
}
