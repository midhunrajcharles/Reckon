import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { chainInfo } from "lib";

/**
 * The critique agent's OWN eyes. This client must never point at anything
 * KeeperHub operates — independence is the whole point. Defaults to the
 * public Base Sepolia RPC; override with BASE_SEPOLIA_RPC_URL in .env.
 * Return type is inferred: viem's OP-stack chain formatters don't fit the
 * generic PublicClient annotation, and callers only need ReceiptReader.
 */
const clients = new Map<number, ReturnType<typeof createClient>>();

function createClient(chainId: number) {
  const info = chainInfo(chainId);
  if (!info || chainId !== baseSepolia.id) {
    throw new Error(`No independent RPC configured for chainId ${chainId} — see CHAINS in lib/chains.ts`);
  }
  const url = process.env[info.rpcEnvVar] || info.defaultRpcUrl;
  return createPublicClient({ chain: baseSepolia, transport: http(url) });
}

/** Memoised: the reverify loop asks per intent, per pass, forever. */
export function makeIndependentClient(chainId: number) {
  const existing = clients.get(chainId);
  if (existing) return existing;
  const client = createClient(chainId);
  clients.set(chainId, client);
  return client;
}
