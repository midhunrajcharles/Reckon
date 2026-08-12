# Gate 6 proof — the live URL works logged-out

Verified 2026-08-11. Every value below was observed against the deployed site,
not inferred from a successful build. A green deploy was explicitly not accepted
as evidence.

## Deployment

| Field | Value |
| --- | --- |
| Production URL | <https://reckon-bay.vercel.app> |
| Deployment | `reckon-hg07kgy7y-mavrriixx-2514s-projects.vercel.app` |
| Deployment ID | `dpl_G3MP1bP1vMRuHkyEosQZMgFJhNZM` |
| Ready state | `READY`, target `production` |

## 1. Logged-out load

Two independent checks, neither carrying a Vercel session.

**Cookieless HTTP** — `curl` sends no cookies at all, a stricter test than a
private window:

```
https://reckon-bay.vercel.app                             http_code=200 redirect= size=14512
https://reckon-hg07kgy7y-…vercel.app                      http_code=200 redirect= size=14512
```

No redirect to an auth wall. Vercel Authentication (`ssoProtection`) is
disabled — confirmed `null` via the project API.

**Cookieless browser** — the tape is client-rendered, so HTML alone proves
nothing. Loaded in a clean browser context:

| Check | Result |
| --- | --- |
| `document.cookie` | empty |
| Page title | `Reckon — settlement tape` |
| `SETTLED` present | yes |
| Hashes rendered | 101 |
| Latest settled block | `#45351507` |

## 2. Real ledger rows, not placeholders

`GET /api/tape` on the deployed site returned **50 rows**:

| Counter | Value |
| --- | --- |
| settled | 55 |
| reconciled | 57 |
| discrepancies caught | 2 |

Row status breakdown: 49 `settled`, 1 `awaiting_verification`. The newest rows
come from the standing worker running during verification — e.g. task
`standing-84532-2026-08-11T17:58:43.707Z`, execution `4l64v3nnhvmzcj6k8eqky`,
receipt `success` at block 45351421.

## 3. A chaos scenario on the deployed site

`POST /api/chaos/reported-failure` against production returned **HTTP 200** with
a genuine block verdict:

| Field | Value |
| --- | --- |
| Task | `demo-failure-1786471436044` |
| Execution ID | `aa451ylbgjf94yllerwnu` |
| Transaction hash | `0xa051f910df23e987ee87ab7c1f1f3cee0c08c38b6879dc7543b7c83090c884f4` |
| Verdict | `block` — `reported_failed_chain_success` |
| `retryRefused` | `true` |

Independently verified against Base Sepolia, from an RPC outside the app:

| Field | Value |
| --- | --- |
| Receipt status | `success` |
| Block | 45351576 |
| `from` (relayer) | `0xdcf4bac4bd805948168ff63483bc493894a29613` |
| `to` (relay contract) | `0x5af5194b4b0909eb978e3cf1e25333852277f07d` |

The platform reported `failed`; the chain held a success; Reckon blocked the
retry. One transaction, not two — on the deployed site, not just in tests.

## 4. No secret in the client bundle production actually serves

All 9 referenced assets plus the document were fetched from the production
origin — 1,143,371 bytes — and checked against the **real values** from `.env`,
not merely against patterns.

| Variable | Result |
| --- | --- |
| `KEEPERHUB_API_KEY` | clean |
| `KEEPERHUB_API_BASE_URL` | clean |
| `DATABASE_URL` | clean |
| `TEMPO_RPC_URL` | clean |

Generic patterns — `kh_…`, `postgres://`, `neon.tech`, `npg_…`, `alchemy.com`,
`infura.io`, `Bearer …` — all clean.

Two matches were investigated and are not secrets:

- `BASE_SEPOLIA_RPC_URL` — the match is the hardcoded literal
  `defaultRpcUrl:"https://sepolia.base.org"` in the `lib/chains.ts` chain
  registry, which ships to the client because the tape uses `explorerTxBase`
  from the same object. It matches the env value only because the deployment is
  on the public endpoint. The env var itself is read server-side
  (`agent/chain.ts`) and is not injected into client code.
- `NODE_ENV` — the word "development" inside a stock Next.js error string
  (`"hmrRefresh can only be used in development mode"`).

**Note for anyone swapping in a keyed RPC provider:** replacing the
`BASE_SEPOLIA_RPC_URL` *environment variable* is safe — it never reaches the
client. Editing `defaultRpcUrl` in `lib/chains.ts` to a keyed URL is **not** —
that literal is served to every visitor. Keep that field a public endpoint.
