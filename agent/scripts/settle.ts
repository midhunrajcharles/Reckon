/**
 * Runs N clean zero-value self-transfer settlements through the full
 * pipeline — real broadcasts, no injections. The quiet-agreement rows on the
 * tape. Usage: pnpm settle --execute [--count 3]
 */
import "../env";

import { KeeperHubClient } from "lib";
import { describeSettlement, runSettlement } from "../settle";

async function main() {
  if (!process.argv.includes("--execute")) {
    console.log("Real broadcasts. Re-run with --execute after explicit go-ahead.");
    return;
  }
  const countArg = process.argv.indexOf("--count");
  const count = countArg >= 0 ? Number(process.argv[countArg + 1]) : 3;

  const client = new KeeperHubClient();
  const walletAddress = await client.waitForOrgWallet();
  console.log(`Org wallet: ${walletAddress} — running ${count} clean settlements\n`);

  for (let i = 1; i <= count; i++) {
    const taskId = `settle-${Date.now()}-${i}`;
    const outcome = await runSettlement(client, walletAddress, taskId);
    console.log(`[${i}/${count}] ${describeSettlement(taskId, outcome)}`);
    if (outcome.verdict.action !== "settle") {
      console.error(`  unexpected verdict — stopping. Detail: ${JSON.stringify(outcome.verdict)}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log("\nAll settlements verified against independent receipts and marked SETTLED.");
}

await main();
