/**
 * The one place chain knowledge lives: id, explorer, and which env var holds
 * the independent RPC URL. Adding a chain means one entry here, not literals
 * scattered across agent, app, and scripts.
 */
export interface ChainInfo {
  id: number;
  name: string;
  explorerTxBase: string;
  /** Env var holding the RPC the critique agent reads — must NOT be a KeeperHub endpoint. */
  rpcEnvVar: string;
  defaultRpcUrl: string;
}

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const CHAINS: Record<number, ChainInfo> = {
  [BASE_SEPOLIA_CHAIN_ID]: {
    id: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    explorerTxBase: "https://sepolia.basescan.org/tx/",
    rpcEnvVar: "BASE_SEPOLIA_RPC_URL",
    defaultRpcUrl: "https://sepolia.base.org",
  },
};

export function chainInfo(chainId: number): ChainInfo | undefined {
  return CHAINS[chainId];
}

/** Explorer link for a tx, or undefined when the chain isn't registered. */
export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  const info = chainInfo(chainId);
  return info ? `${info.explorerTxBase}${txHash}` : undefined;
}
