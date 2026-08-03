# CLAUDE.md — Reckon

Project memory for Claude Code. Read this before touching anything in this repo.
Full plan lives in `PROJECT_BRIEF.md` — re-read that at the start of every session.

## What this is

Reckon is an autonomous onchain settlement agent for the KeeperHub "Agents Onchain"
hackathon (DoraHacks). It refuses to mark a payment settled until an independent
chain read confirms it — the platform's own "success" signal is treated as a
hypothesis, never a fact. Deadline: 2026-08-13 12:00 UTC+2 (hard).

## Repo layout

- `/app` — Next.js App Router dashboard (Tailwind + shadcn/ui). `pnpm dev` at repo
  root runs this.
- `/agent` — standalone `tsx` worker process. Not a Next.js API route; runs
  independently (local for demo, Railway for deploy).
- `/lib` — shared TypeScript, including the KeeperHub client (`/lib/keeperhub`).
- `/db` — Drizzle schema and queries against Neon Postgres (the settlement ledger).
- `/docs` — submission artifacts, including `submission-tx.md` (Gate 1 proof).
- Root is a pnpm workspace; `app`, `agent`, `lib`, `db` are workspace packages.

## Stack (locked — do not re-litigate)

- TypeScript, Node 20+
- Next.js App Router + Tailwind + shadcn/ui — dashboard
- viem — independent chain reads and receipt verification
- Neon Postgres + Drizzle ORM — the settlement ledger
- Agent worker: standalone `tsx` process in `/agent`
- Deploy: dashboard on Vercel, worker on Railway (local is fine for the demo)
- No custom smart contracts. Execution goes through KeeperHub — that is the rule of
  the hackathon.
- `code/run-code` on KeeperHub is Pro-gated with no hackathon access — all
  computation happens agent-side, always.

## Rules of engagement (non-negotiable)

- **Never fabricate a transaction hash, execution ID, metric, or receipt.** Judges
  operate the platform and can query anything shown. Every number in the submission
  comes from a real run.
- **Confirm before every real (non-simulated) broadcast.** Simulations run freely.
- **Credentials are the user's.** `KEEPERHUB_API_KEY` goes in `.env` by the user.
  Never print it, commit it, or echo it into logs.
- **Commit continuously** — small commits, real messages. No single-dump repo.
  Name the hackathon in the README.
- Anything mocked is labelled as mocked, in the README and on screen.
- **If a phase gate fails, stop and report. Do not proceed to the next phase.**

## KeeperHub API gotchas (hard-won — encode as types/guards, do not rediscover)

- Auth header is `Authorization: Bearer kh_...`. NOT `X-API-Key` (stale docs).
- Send a descriptive `User-Agent`, or Cloudflare returns a JSON 403 that looks like
  a KeeperHub error. Check for `ray_id`/`cloudflare_error` keys when diagnosing 403s.
- `GET /api/keys` with the bearer token is the auth probe. 200 = valid, org-scoped.
- Use the **org wallet** from `GET /api/user → walletAddress`, never the sign-in
  address. Provisioning is async — `null` means pending; poll it.
- `simulate` must be a strict JSON boolean. String `"true"` is rejected with 400 by
  design, to prevent silent fall-through to a real broadcast.
- Simulation reverts return **HTTP 400 with `wouldRevert: true`**. Don't let a
  generic "non-2xx = failed" wrapper discard the decoded revert reason.
- `gasLimitMultiplier` is a **string** (e.g. `"1.5"`). `abi` is a **JSON string**,
  not an array. `functionArgs` is a **JSON-stringified positional array**. Wrong
  types 422 silently.
- Rate limits: 100/min authenticated, 60/min per key on direct execution. Honour
  `Retry-After` and `X-Poll-Interval-Hint` (`0` = terminal).
- A brand-new org wallet holds nothing; a non-zero first transaction dies in the
  simulator with an opaque `missing revert data` CALL_EXCEPTION. KeeperHub sponsors
  gas on Ethereum/Base/Polygon/Arbitrum (+testnets) — a **zero-value self-transfer**
  lands a real, mined, verifiable tx with no faucet needed.
- Sponsored transactions look unusual on explorers: `from` is the relayer, the
  transfer is an internal call, it won't appear in the EOA txlist. Read the
  `sponsored` field; use `transactionHash`/`transactionLink` as proof.
- The idempotency key travels as the **`Idempotency-Key` HTTP header**. Confirmed
  live 2026-08-11: two identical real executes sharing one key returned the same
  `executionId` and `transactionHash` with `idempotentReplay: true`. A body field
  (`idempotencyKey` or `idempotency_key`) is accepted with 200 and **silently
  ignored** — the wire schema is permissive, so simulate-only probing cannot tell
  you this. Send it on real broadcasts only; a simulation cannot double-spend.
- Idempotency key recipe: `taskId|chainId|recipientAddress|amount|tokenAddress` —
  pipe-separated, addresses lowercased, chain as decimal, amount as a canonical
  plain decimal string (no exponents, no leading/trailing zeros), then SHA-256 hex.
  **Scheduled jobs must include the period in `taskId`** or keys collide across the
  24h replay window. Handle `idempotentReplay: true`, 409 `idempotency_conflict`
  (with `originalExecutionId`), and 409 `idempotency_in_progress`.
- `validBefore` (Tempo sign-and-hold) is a **time bound, not a state bound** — a
  scheduled release fires at T regardless of whether the triggering condition still
  holds. Re-check the predicate shortly before T and cancel via
  `POST /api/tempo/held-payments/{id}/cancel` if broken. No native cancel node —
  that gap is a candidate feature PR.
- Do **not** enable private mempool routing anywhere — it routes all RPC through the
  private endpoint and multi-step reads time out (open, unresolved platform issue).
- Known platform bug: a successful Tempo transaction can be reported as FAILED due
  to a tx-parsing break, which would cause a naive agent to retry and double-spend.
  This is the exact failure Reckon's critique agent exists to catch.

## The critique agent — this is the product

A second, independent agent that never trusts the platform's own success signal.
Reported status is a hypothesis; only an independently-fetched (viem) receipt makes
an intent `SETTLED`. Fails **closed** on `not_found`/`timeout`. On a mismatch between
reported and verified status, write a `discrepancy` row and **block the retry** —
this is the double-spend defence and the core thesis of the project.

## Phase gates

| Gate | Condition | If it fails |
|---|---|---|
| 0 | Repo builds, `pnpm dev` serves an empty page | Fix before anything |
| **1** | **A real tx hash resolves on an explorer** | **Stop. Nothing else matters.** |
| 2 | Forced mismatch blocks the retry | Core thesis unproven — fix |
| 3 | Chaos panel legible in 20s with no explanation | Redesign, don't add features |
| 4 | Double-spend regression test passes | Fix |
| 6 | Live URL opens logged-out | Fix |

Feature freeze end of Day 5. Report at every gate. Ask before any real broadcast.
