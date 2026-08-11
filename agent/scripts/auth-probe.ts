import "../env";

import {
  KeeperHubAuthError,
  KeeperHubCloudflareBlockedError,
  KeeperHubClient,
  KeeperHubConfigError,
  KeeperHubHttpError,
} from "lib";

async function main() {
  console.log("KeeperHub auth probe — GET /api/keys\n");

  let client: InstanceType<typeof KeeperHubClient>;
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

  try {
    await client.getKeys();
    console.log("PASS — key is valid and org-scoped (HTTP 200 from GET /api/keys).");
  } catch (err) {
    if (err instanceof KeeperHubCloudflareBlockedError) {
      console.error(`FAIL — blocked by Cloudflare, not KeeperHub: ${err.message}`);
    } else if (err instanceof KeeperHubAuthError) {
      console.error(`FAIL — auth rejected: ${err.message}`);
    } else if (err instanceof KeeperHubHttpError) {
      console.error(`FAIL — KeeperHub returned HTTP ${err.status}${err.code ? ` (${err.code})` : ""}: ${err.message}`);
    } else {
      console.error("FAIL — unexpected error during auth probe:", err);
    }
    process.exitCode = 1;
  }
}

await main();
