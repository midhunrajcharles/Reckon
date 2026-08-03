PROJECT_BRIEF.md

# PROJECT BRIEF — "Reckon"

You are my engineering partner for a 6-day hackathon build. Read this whole brief
before writing anything. Re-read it at the start of every session.

## Mission

Build **Reckon** — an autonomous onchain settlement agent that refuses to mark a
payment settled until the chain independently agrees.

Tagline: *Your payment agent said it succeeded. Reckon checked the chain before
believing it.*

## Why this exact thing

Competition: KeeperHub "Agents Onchain" hackathon on DoraHacks.
Deadline: **2026-08-13 12:00 UTC+2** (treat as hard; a conflicting 15:30 is listed
elsewhere — always assume 12:00).

Judging criteria, in stated weight order:
1. Does it execute onchain via KeeperHub? (weighted heaviest — a real linked tx)
2. Breadth of KeeperHub surfaces used (MCP, CLI, x402, MPP, workflow builder, audit trail)
3. Reliability and observability — retries, gas handling, audit trail, failure modes
4. Originality and real-world usefulness
5. Integration quality and developer experience

The sponsor published a retrospective on their last hackathon: 88 of 180 projects
lost on "weak integration — direct HTTP calls, webhook-only, surface-level," and
"most teams avoided failure-mode thinking." Criterion 3 is their own unmet
complaint written into the rubric. Reckon targets it directly.

Known platform bug we are defending against (reported with onchain proof by another
builder): a successful Tempo transaction can be reported as FAILED due to a tx-parsing
break, causing a naive agent to retry and double-spend. Our critique agent exists to
make that impossible.

## Non-negotiable rules of engagement

- **Never fabricate a transaction hash, execution ID, metric, or receipt.** The judges
  operate the platform and can query anything we show. Every number in the submission
  must come from a real run.
- **Confirm with me before every real (non-simulated) broadcast.** Simulations you may
  run freely.
- **I handle all credentials.** I put `KEEPERHUB_API_KEY` in `.env` myself. Never print
  it, commit it, or echo it into logs.
- **Commit continuously**, small commits with real messages. Winner validation checks
  for single-dump repos. Name this hackathon in the README.
- Anything mocked gets labelled as mocked, in the README and on screen.
- If a phase gate fails, tell me and stop. Do not proceed to the next phase.

## Stack (locked — do not re-litigate)

- TypeScript, Node 20+
- Next.js App Router + Tailwind + shadcn/ui — dashboard
- viem — independent chain reads and receipt verification
- Neon Postgres + Drizzle ORM — the settlement ledger
- Agent worker: standalone `tsx` process in `/agent`
- Deploy: dashboard on Vercel, worker on Railway (local is fine for the demo)
- No custom smart contracts. Execution goes through KeeperHub. That is the rule of
  the hackathon.

`code/run-code` on KeeperHub is Pro-gated with no hackathon access — all computation
happens agent-side. Design for that from the start.

---

# PHASE 0 — Foundation (today)

Use skills: `init`, `code-quality`

1. Scaffold the repo: `/agent`, `/app` (Next.js), `/lib` (shared), `/db`, `/docs`.
2. Generate `CLAUDE.md` capturing the stack, the rules of engagement above, and the
   KeeperHub API gotchas listed in Phase 1.
3. `.env.example` with every var named and documented. Real `.env` gitignored.
4. Initialise git, first commit, README stub naming the hackathon.

**GATE 0:** repo builds clean, `pnpm dev` serves an empty page.

---

# PHASE 1 — Core loop, unbreakable (Day 1–2)

Use skills: `web3-libraries`, `ethereum-evm-networks`, `web3-mcp-servers`, `error-handling`

This phase ends with a real, verifiable transaction. Nothing else matters until it does.

## 1.1 KeeperHub client

Build a typed client in `/lib/keeperhub`. Hard-won API details — encode these as types
and runtime guards, do not rediscover them:

- Auth is `Authorization: Bearer kh_...`. NOT `X-API-Key` (stale docs).
- Send a descriptive `User-Agent` or Cloudflare returns a JSON 403 that looks like a
  KeeperHub error. Check for `ray_id`/`cloudflare_error` keys when diagnosing 403s.
- `GET /api/keys` with the bearer is the auth probe. 200 = valid and org-scoped.
- The wallet to use is the **org wallet** from `GET /api/user → walletAddress`, not my
  sign-in address. Provisioning is async — a `null` means pending, poll it.
- `simulate` must be a strict JSON boolean. String `"true"` is rejected with 400 by
  design, to stop silent fall-through to a real broadcast.
- Simulation reverts return **HTTP 400 with `wouldRevert: true`**. Do not let a generic
  "non-2xx means failed" wrapper discard the decoded revert reason.
- `gasLimitMultiplier` is a **string** (`"1.5"`). `abi` is a **JSON string**, not an
  array. `functionArgs` is a **JSON-stringified positional array**. Wrong types 422
  silently.
- Rate limits: 100/min authenticated, 60/min per key on direct execution. Honour
  `Retry-After` and `X-Poll-Interval-Hint` (0 = terminal).

## 1.2 First transaction — zero-value self-transfer

A brand-new org wallet holds nothing, and a non-zero first run dies in the simulator
with an opaque `missing revert data` CALL_EXCEPTION. Because KeeperHub sponsors gas on
Ethereum/Base/Polygon/Arbitrum and their testnets, a **zero-value self-transfer lands a
real, mined, independently verifiable transaction with no faucet and no funding.**

Write `/agent/scripts/first-tx.ts` that does exactly this on Base Sepolia (84532):
simulate → confirm with me → execute → poll status → print the tx hash and link.

Note: sponsored transactions look unusual on explorers. The `from` is the relayer, the
transfer is an internal call, and it won't appear in the EOA txlist. Read the
`sponsored` field and use `transactionHash`/`transactionLink` as proof.

**GATE 1: a real transaction hash exists and resolves on a block explorer.**
Save it to `/docs/submission-tx.md`. The hackathon's hardest requirement is now met.
Do not proceed until this is done.

## 1.3 Tempo settlement path

Ask me first whether the Tempo Moderato faucet question has been answered in Discord.
If testnet stablecoins are unavailable, **stay on Base Sepolia and treat Tempo as a
stretch goal** — say so and move on. Do not stall.

If available: implement `tempo/transfer-with-memo` with a 32-byte indexed memo, plus
sign-and-hold. Tempo pays fees in stablecoins, has no gas token, and is not on the
sponsorship list.

---

# PHASE 2 — Backend and the critique agent (Day 2–3)

Use skills: `backend`, `api-design`, `database-schema-design`, `error-handling`,
`rate-limiting`, `observability`

## 2.1 Ledger schema

Drizzle schema for: `intents`, `attempts`, `receipts`, `discrepancies`.
Every attempt records trigger, simulation result, gas bid, retry number, idempotency
key, execution ID, reported status, verified status, and timestamp.

## 2.2 Idempotency

Implement the documented stable-key recipe exactly:
`taskId|chainId|recipientAddress|amount|tokenAddress` — pipe-separated, addresses
lowercased, chain as decimal, amount canonicalised as a plain decimal string (no
exponents, no leading/trailing zeros), then SHA-256 hex.

**Scheduled jobs must include the period in `taskId`** or keys collide across the
24-hour replay window. Handle all three responses: `idempotentReplay: true`, 409
`idempotency_conflict` (with `originalExecutionId`), 409 `idempotency_in_progress`.

## 2.3 The critique agent — this is the product

A second, independent agent that never trusts the platform's own success signal.

For every execution:
1. Read the reported status.
2. **Independently** fetch the receipt via viem using the tx hash.
3. Compare. Treat `receipts[]`, `verified`, and `receiptStatus` as authoritative.
4. Fail **closed** on `not_found` and `timeout` — never optimistically settle.
5. When reported status and chain truth disagree, write a `discrepancy` row and
   **block the retry**. This is the double-spend defence.

An intent is only `SETTLED` when the chain says so. Reported success is a hypothesis.

## 2.4 Sign-and-hold gating (if Tempo is live)

`validBefore` is a **time bound, not a state bound** — a scheduled release fires at T
regardless of whether the signal still holds. Implement the documented pattern: a
second check shortly before T that re-evaluates the predicate and, if broken, cancels
via `POST /api/tempo/held-payments/{id}/cancel`. There is **no native cancel node** —
that gap is worth a feature PR.

**GATE 2:** an intent runs end to end, is reconciled against a real receipt, and a
forced mismatch produces a `discrepancy` row instead of a second transaction.

---

# PHASE 3 — Frontend (Day 3–4, full day, real design effort)

Use skills: `frontend`, `ui-ux-pro-max`, `frontend-design`, `nextjs-app-router`,
`tailwind-css`, `react-best-practices`, `state-management`, `dataviz`,
`web3-frontend-dapp`

The judges cannot assess backend depth in three minutes but assess UI instantly. This
is the channel through which the reconciliation work becomes visible. Budget real time.

## 3.1 The Tape — the single screen that wins this

A live settlement ledger. One row per attempt:

`intent → simulation → gas bid → attempt N → reported status → CHAIN TRUTH → verdict`

Design requirements:
- The **divergence between reported and verified is the visual centrepiece.** When they
  disagree, that row must be impossible to miss.
- Terminal states colour-coded and legible at a glance: settled, blocked, reverted,
  unverified.
- Every tx hash is a live explorer link. Judges will click them.
- Running counters, prominent: settlements executed · reconciled · **discrepancies
  caught**. That last number is the most quotable result in the event.
- Real-time updates — poll on an interval or SSE. Never a spinner where progressive
  reveal would work; visible generation is what reads as alive.
- Dark mode by default, responsive, no horizontal body scroll.

Use `dataviz` for the counters and any timeline. Use `ui-ux-pro-max` and
`frontend-design` for the visual identity — this must not look like a default template.

## 3.2 The chaos panel

Two buttons, and they are the demo:
- **"Inject reported-failure"** — forces the known Tempo/parse condition. The tape shows
  the platform reporting failure, the critique agent verifying against chain, and the
  retry being blocked. One transaction, not two.
- **"Inject gas spike"** — shows escalation and recovery.

**GATE 3:** someone who has never seen the project understands what happened within
20 seconds of watching the chaos panel, with zero explanation.

---

# PHASE 4 — Tests and hardening (Day 4–5)

Use skills: `web3-testing`, `test-architect`, `testing-strategies`, `qa-engineering`,
`debugging-master`

The last winner's stated edge was "production seriousness" — 125 tests, live deploy,
and filed bug reports. Match it.

- Unit tests on the idempotency key derivation, including the period-collision case
- Reconciliation tests for every `receiptStatus` value, especially `not_found`/`timeout`
- A regression test for the double-spend scenario — this is the headline test
- Error-path tests: 401, 403 `insufficient_scope`, 422 `WALLET_NOT_CONFIGURED`, 429,
  400-with-`wouldRevert`
- Do **not** enable private mempool routing anywhere — it routes all RPC through the
  private endpoint and multi-step reads time out (open, unresolved platform issue)

Print the test count. It goes in the submission.

**File every platform bug we hit as a GitHub issue as we hit it.** Filing detailed bug
reports was the explicitly stated reason the last 1st-place project won.

---

# PHASE 5 — Security and quality (Day 5)

Use skills: `web3-security-auditing`, `security-hardening`, `code-quality`, `simplify`

- No secrets in the repo, no keys in logs, no key material in client bundles
- Validate every external input; strict EIP-55 checksummed or all-lowercase addresses
  only (mangled mixed-case is rejected even when the hex is right)
- Spending caps enforced and surfaced in the UI
- Then run `simplify` across the diff and cut anything that doesn't raise a rubric line

---

# PHASE 6 — Deployment (Day 5)

Use skills: `web3-deployment-infra`, `vercel:nextjs`, `vercel:env-vars`, `vercel:deploy`,
`ci-cd-pipeline`

- Dashboard to Vercel, env vars set via the Vercel dashboard by me (not committed)
- Worker to Railway, or documented as local-for-demo — either is fine, but **say which**
  in the README
- Deploy on day one of this phase, not the last hour
- Verify the live URL opens logged-out in a private window

---

# PHASE 7 — Submission artifacts (Day 6)

Use skills: `winning-hackathon-writeup`, `hackathon-pitch-builder`, `screen-recording`,
`video-editing`, `ffmpeg`

## 7.1 Two documents, never merged

**BUIDL submission** (for a judge): open on the specific failure — the 3am duplicate
payment — not a market statement. Include a three-column table (`Surface | How we used
it | Why it mattered`). Quantify everything. Caption every figure. State what's real vs
mocked. Close on impact.

**README** (for a developer who just cloned): prerequisites with versions, numbered
setup steps, expected-output blocks, one copy-pasteable example, a reference table,
troubleshooting. Shares at most one paragraph with the submission.

## 7.2 Demo video

Draft the **beats and timings** only — I write the words and narrate. AI-written demo
scripts read generic and judges flag them.

Under 3 minutes. Something working by 0:90. Show the URL bar and the explorer. Keep any
genuine near-miss in the take. Upload unlisted, not private, marked Not for Kids, and
verify the link in a private window.

## 7.3 Two separate BUIDLs

Grand prize (with video) and the onboarding bounty (no video needed, no pitch round)
are **separate DoraHacks submissions** — the organizer said so explicitly.

---

# Phase gates summary

| Gate | Condition | If it fails |
|---|---|---|
| 0 | Repo builds | Fix before anything |
| **1** | **A real tx hash resolves on an explorer** | **Stop. Nothing else matters.** |
| 2 | Forced mismatch blocks the retry | Core thesis unproven — fix |
| 3 | Chaos panel legible in 20s with no explanation | Redesign, don't add features |
| 4 | Double-spend regression test passes | Fix |
| 6 | Live URL opens logged-out | Fix |

**Feature freeze end of Day 5.** After that: hardening, demo, submission only. A feature
that is 90% done at freeze does not go in the demo.

Start with Phase 0, then Phase 1. Report at every gate. Ask me before any real broadcast.