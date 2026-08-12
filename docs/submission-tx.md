# Gate 1 proof — first real onchain transaction

A real, mined, independently verified transaction executed through KeeperHub's
Direct Execution API. Nothing on this page is fabricated: every value below was
returned by a live API call or read directly from Base Sepolia.

## Transaction

| Field | Value |
| --- | --- |
| Network | Base Sepolia (chainId 84532) |
| Type | Zero-value self-transfer (gas sponsored by KeeperHub) |
| Org wallet | `0x4807d3517aca44fadd988d94a2da7dc382ce72e8` |
| Execution ID | `mqm4b78rjeoeyr06mxe2d` |
| Terminal status (KeeperHub) | `completed` |
| Transaction hash | `0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04` |
| Explorer | <https://sepolia.basescan.org/tx/0x8b441712eb72197260e75bd2bc9e371df64da9a9f5467ea6e2c05798700dae04> |
| Sponsored | `true` |

## Independent verification (the Reckon rule)

KeeperHub's `completed` was treated as a hypothesis. The receipt was fetched
independently from a Base Sepolia RPC:

| Field | Value |
| --- | --- |
| Receipt status | `success` |
| Block | 45302623 |
| Block hash | `0x0a90015de249bf7c2d8a810f154618d64d6ff1e242700e8cd5c0003f378fa7d7` |
| `from` (relayer) | `0xdcf4bac4bd805948168ff63483bc493894a29613` |
| `to` (relay contract) | `0x5af5194b4b0909eb978e3cf1e25333852277f07d` |
| Tx type | `eip7702` |

Because the transaction is sponsored, the explorer shows the **relayer** as
`from` and the self-transfer as an internal call — it will not appear in the org
wallet's EOA transaction list. The transaction hash and receipt above are the
proof.

## How it was produced

```
pnpm --filter agent first-tx            # simulate only (wouldRevert=false, gasEstimate=21000)
pnpm --filter agent first-tx --execute  # real broadcast, after explicit approval
```

Executed 2026-08-10 via `agent/scripts/first-tx.ts`, then polled
`GET /api/execute/{executionId}/status` to the terminal state.
