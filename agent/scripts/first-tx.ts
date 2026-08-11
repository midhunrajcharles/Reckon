import "../env";

import {
  BASE_SEPOLIA_CHAIN_ID,
  explorerTxUrl,
  KeeperHubClient,
  KeeperHubConfigError,
  KeeperHubHttpError,
  KeeperHubSimulationRevertError,
} from "lib";

// Base Sepolia — KeeperHub sponsors gas here, so a zero-value self-transfer
// lands a real, mined transaction with no faucet and no funding. A non-zero
// first run on a brand-new (empty) org wallet dies in the simulator with an
// opaque `missing revert data` CALL_EXCEPTION — this is why amount must be "0".

function printProof(result: { transactionHash?: string; transactionLink?: string; sponsored?: boolean }) {
  console.log("\n=== PROOF ===");
  console.log(`sponsored:        ${result.sponsored ?? "(field not present in response)"}`);
  console.log(`transactionHash:  ${result.transactionHash ?? "(none returned)"}`);
  console.log(
    `transactionLink:  ${
      result.transactionLink ??
      (result.transactionHash ? explorerTxUrl(BASE_SEPOLIA_CHAIN_ID, result.transactionHash) : "(none)")
    }`,
  );
  if (result.sponsored) {
    console.log(
      "\nNote: sponsored txs look unusual on explorers — `from` is the relayer, the transfer is an " +
        "internal call, and it will not appear in the EOA txlist. transactionHash/transactionLink are the proof.",
    );
  }
}

async function main() {
  const execute = process.argv.includes("--execute");

  console.log(`Mode: ${execute ? "EXECUTE (real broadcast)" : "SIMULATE ONLY"}\n`);

  let client: KeeperHubClient;
  try {
    client = new KeeperHubClient();
  } catch (err) {
    if (err instanceof KeeperHubConfigError) {
      console.error(`Config error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log("Resolving org wallet (GET /api/user, polling if provisioning is pending)...");
  let walletAddress: `0x${string}`;
  try {
    walletAddress = await client.waitForOrgWallet();
  } catch (err) {
    console.error(`Could not resolve org wallet: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Org wallet: ${walletAddress}\n`);

  // Self-transfer via the Direct Execution API's native-transfer endpoint —
  // recipient is the org wallet itself, amount "0". No abi/functionArgs:
  // that's the contract-call surface, not this one.
  const input = {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    recipientAddress: walletAddress,
    amount: "0",
  };

  console.log("Simulating zero-value self-transfer on Base Sepolia (84532) via POST /api/execute/transfer...");
  try {
    const simResult = await client.simulateTransfer(input);
    console.log(`Simulation result: wouldRevert=${simResult.wouldRevert}, gasEstimate=${simResult.gasEstimate}`);
    console.log(JSON.stringify(simResult.raw, null, 2));
  } catch (err) {
    if (err instanceof KeeperHubSimulationRevertError) {
      console.error(`Simulation would revert: ${err.revertReason ?? "(no revertReason in response body)"}`);
      console.error("Raw body:", JSON.stringify(err.body));
    } else if (err instanceof KeeperHubHttpError) {
      console.error(`Simulation request failed: HTTP ${err.status}${err.code ? ` (${err.code})` : ""} — ${err.message}`);
      console.error("Raw body:", JSON.stringify(err.body));
    } else {
      console.error("Unexpected error during simulation:", err);
    }
    process.exitCode = 1;
    return;
  }

  if (!execute) {
    console.log("\nSimulate-only run complete. Re-run with --execute to broadcast for real — only after explicit go-ahead.");
    return;
  }

  console.log("\nExecuting for real (simulate: false)...");
  let execResult;
  try {
    execResult = await client.executeTransfer(input);
  } catch (err) {
    if (err instanceof KeeperHubHttpError) {
      console.error(`Execute request failed: HTTP ${err.status}${err.code ? ` (${err.code})` : ""} — ${err.message}`);
      console.error("Raw body:", JSON.stringify(err.body));
    } else {
      console.error("Unexpected error during execute:", err);
    }
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(execResult, null, 2));

  if (!execResult.executionId) {
    console.log("\nNo executionId in the response — nothing to poll. Reporting what execute returned directly.");
    printProof(execResult);
    return;
  }

  console.log(`\nPolling execution status for ${execResult.executionId}...`);
  const status = await client.waitForExecution(execResult.executionId);

  console.log(`\nFinal status: ${status.status}`);
  printProof(status);
}

await main();
