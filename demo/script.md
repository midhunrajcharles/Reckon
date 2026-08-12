# Reckon — demo film

Runtime target **2:19** · 1920×1080 · H.264 · narration `demo/vo/narration.mp3`

Captured from the live deployment at <https://reckon-bay.vercel.app> by
`scripts/capture-demo.ts` (Playwright, CDP screencast at **2× device scale** —
3840×2160 source, so a 2.4× punch-in is a true crop and not an upscale). The
capture drives the page itself; it is not a screen recording and the desktop is
never in frame. A cursor is drawn into the page by the capture rig because
Playwright's video does not include a pointer. It is the only overlay.

Global: Ken Burns on every static hold (1.00 → 1.06, full shot duration,
centered). Punch-ins are hard cuts to a crop region, never animated zooms.
Sub-drone bed at -26dB throughout. Narration always dominant.

---

## Numbers policy

**No figure in this script is written as a literal.** The counters move during
the capture — shots 3 and 5 each run a real settlement — so any number typed
here by hand is stale the moment it is typed.

Narration and title cards use tokens, resolved from
`demo/capture/marks.json` at VO-render time by `scripts/generate-vo.ts`:

| Token | Source | Spoken as |
|---|---|---|
| `{{settledBefore}}` | `evidence.countersAtCapture["Settled onchain"]` | words |
| `{{reconciledBefore}}` | `evidence.countersAtCapture["Attempts reconciled"]` | words |
| `{{discrepanciesBefore}}` | `evidence.countersAtCapture["Discrepancies caught"]` | words |
| `{{settledAfter}}` | `evidence.countersAtEnd["Settled onchain"]` | words |
| `{{reconciledAfter}}` | `evidence.countersAtEnd["Attempts reconciled"]` | words |
| `{{discrepanciesAfter}}` | `evidence.countersAtEnd["Discrepancies caught"]` | words |

The 01:49.5 title card uses `{{settledAfter}}` as a numeral. If a token cannot
be resolved, the VO build fails — it never falls back to a placeholder.

## Explorer note — read before Shot 4

The shot list below says BaseScan. **BaseScan serves a Cloudflare interstitial
to automated browsers** — the first capture attempt recorded a "Just a
moment…" screen where the transaction should have been. Shot 4 therefore
resolves the hash on **Blockscout** (`base-sepolia.blockscout.com`), an
independent public explorer that loads clean.

This is a substitution of explorer, not of evidence: same hash, same block,
same `Success`. The narration says "a public explorer" and never names
BaseScan, so nothing on screen contradicts anything spoken. The row on the
tape still links to BaseScan — that link is the product's, and it is not
altered for the film.

---

## Shot list

### 00:00 — COLD OPEN
Black. Full silence. 2s.

### 00:02 — TITLE CARD
`3:04 AM` · black, Instrument Serif, white, letterboxed 2.39:1. 1.5s. Hard cut out.

---

### 00:03.5 — SHOT 1 · THE PROBLEM — `blockedRow` (VO ¶1, ~17s)

Open mid-tape, a **RETRY BLOCKED** row centered, red seam clearly visible.
Ken Burns push throughout.

- On *"and pays twice"* → **hard punch to 2.4×** on the caption `One transaction, not two.`
  Hold 2s. Cut back.

> The irony is the point: the voice says *pays twice*, the screen says *one
> transaction, not two.* This is the strongest beat in the film. Land it precisely.

**¶1 —** This row is a payment the platform reported as failed. The chain says
it succeeded. An agent that believes the report retries the settlement — and
pays twice. Reckon caught the mismatch, and blocked the retry.

### 00:20.5 — TITLE CARD
`THE PLATFORM SAID IT FAILED.` · 1.5s.

---

### 00:22 — SHOT 2 · THE COUNTERS — `counters` (VO ¶2, ~13s)

Smooth scroll up to the three counters. Hold all three in frame. Ken Burns push.

- On *"zero double payments"* → punch to **DISCREPANCIES CAUGHT**. Hold 1.5s.

**¶2 —** {{settledBefore}} settlements confirmed onchain. {{reconciledBefore}}
attempts reconciled against an independent node. {{discrepanciesBefore}}
discrepancies caught, and zero double payments — {{discrepanciesBefore}} times
the platform's answer did not match the chain.

---

### 00:35 — SHOT 3 · PROOF ONE — `reportedFailure` (VO ¶3, ~33s) — the core of the film

1. Cursor travels visibly to **INJECT REPORTED FAILURE**. Hover 0.8s so the armed
   state reads. Click.
2. New row slides in at the top of the tape. Ken Burns during the wait. **Do not
   trim the latency** — real time only.
3. On *"Reported: failed"* → punch to the **REPORTED** column, struck-through `failed`.
   Hold 1.5s.
4. **MATCH CUT** → **CHAIN TRUTH** column, framed identically, `success · block …`.
   Hold 1.5s.

   > Same crop size, same screen position, one word changes. Two frames that carry
   > the whole thesis. If only one shot in this film is perfect, make it this one.

5. On *"Retry blocked"* → punch to the **RETRY BLOCKED** stamp the frame it lands.
   Sync the low percussive hit to the stamp.
6. On *"One transaction, not two"* → hold on that caption, still.

**¶3 —** Now watch it happen live. This injects the exact failure mode a
settlement platform can produce: the payment broadcasts for real, it mines, and
then the agent is told that it failed. What you are waiting on now is a real
settlement, at real speed. Here is what the agent is handed. Reported: failed.
Chain truth: success. Reckon fetched that receipt itself, with viem, against a
node KeeperHub does not operate. Retry blocked. The intent is closed and the
second attempt refused. One transaction, not two.

> Everything before *"Reported: failed"* is written to run about fourteen
> seconds — long enough to cover the real injection wait. That is why the
> paragraph opens the way it does: the alternative is delaying the voice until
> the row lands, which costs the film ten seconds of dead air. If the measured
> wait changes, `assemble-demo.ts` absorbs the difference by shifting the
> narration; it never trims the wait.

> *"Reported: failed. Chain truth: success."* are deliberately adjacent
> sentences. The match cut is driven by the voice — the second crop lands on
> the second phrase, about 1.3s later, so the cut has a reason to exist beyond
> the editor wanting one. Reword these two sentences and the match cut dies.

### 01:03 — TITLE CARD
`THE CHAIN SAID OTHERWISE.` · 1.5s.

---

### 01:04.5 — SHOT 4 · INDEPENDENT VERIFICATION — `basescan` (VO ¶4, ~8s)

1. Punch to the **tx hash** so it's readable at laptop size. Hold 1s.
2. Cursor clicks it. The explorer opens.
3. **Absolute stillness.** No Ken Burns, no punch, no move. Let the confirmed
   transaction sit and be read.

> Motion here would undercut the one shot whose entire job is *this is not our claim.*

**¶4 —** The hash is not decoration. It resolves on a public explorer nobody
here operates — same transaction, same block, status success.

---

### 01:12.5 — SHOT 5 · PROOF TWO — `gasSpike` (VO ¶5, ~19s)

1. Cut back to the tape. Cursor to **INJECT GAS SPIKE**. Hover 0.8s. Click.
2. Two rows appear.
3. On *"nothing sent, no hash"* → punch to the **NO BROADCAST** verdict. Hold 1.2s.
4. On *"settles for real"* → punch to the escalated **SETTLED** stamp. Audio hit.
5. Pull back so both rows sit in frame together on *"two rows, one settlement."*

**¶5 —** A different failure, and a different defence. The first gas bid dies
to an injected spike, so the settlement is never broadcast at all. Look at what
the tape records against that attempt — nothing sent, no hash, no charge.
Reckon escalates the bid to one and a half times, re-attempts, and settles for
real. Two rows, one settlement.

---

### 01:27.5 — SHOT 6 · SCALE — `settledHistory` (VO ¶6, ~22s)

Slow, steady, continuous scroll down through the settled history. Dozens of green
**SETTLED** stamps flowing past. No Ken Burns — the scroll is the motion.

> This is the volume shot. It answers "is this a one-off demo or a running system"
> without a word being spent on it. Keep the scroll rate constant and unhurried;
> any acceleration reads as padding.

**¶6 —** Every attempt Reckon has made is on this tape: what the platform
reported, what the chain actually held, and the verdict that follows from the
difference. Nothing here is mocked, and every hash resolves. The rows ruled in
red are the ones where the platform's answer was wrong — each one a payment
that would have gone out twice.

### 01:49.5 — TITLE CARD
`{{settledAfter}} SETTLEMENTS · EVERY INJECTED FAILURE CAUGHT · ZERO DOUBLE PAYMENTS`

Read the live **SETTLED ONCHAIN** counter at capture time and substitute the real
number. Never a stale or rounded figure. (Mechanised: see Numbers policy.)

---

### 01:51 — SHOT 7 · CLOSE — `fullPage` (VO ¶7, ~24s)

Pull back to the full page, counters and tape both in frame. Slow reverse push
(1.06 → 1.00).

- On *"Agents can already act"* → begin a slow fade toward black.
- Full silence, 0.5s, before the last card.

**¶7 —** {{settledAfter}} settled onchain. {{reconciledAfter}} attempts
reconciled. {{discrepanciesAfter}} discrepancies caught — the most recent one a
minute ago, on camera. Agents can already act onchain. What they cannot yet do
is know whether the action landed. Reported status is a hypothesis. Only an
independent read settles it.

### 02:15 — TITLE CARD
`RECKON` large · `reckon-bay.vercel.app` small beneath. Hold 3s. Fade out.

---

## Cursor choreography

The cursor is a character. OBS captures it, so it must read as a hand.

- Travel in visible steps via `page.mouse.move()` — never teleport to a click.
- Hover 0.8s before every click so the button's armed state registers.
- Move at a human rate: roughly 600–900px/sec, ease in and out.
- Park it off to the side during holds. A cursor idling over content is noise.

## Audio map

| Layer | Treatment |
|---|---|
| Narration | Dominant. Nothing competes with a word. |
| Sub-drone bed | -26dB, non-melodic, continuous |
| Stamp hits | Low percussive, frame-synced to each stamp landing (3 total) |
| Silence | 0.5s before the final card. Earn it. |

Never speed up audio to hit runtime. Cut visual hold time instead.

## Honesty constraints — non-negotiable

- Proof segments run at real speed. Loading and latency stay in.
- No cut may make a failure read as a success, or the reverse.
- Every number on a title card matches the live site at capture time.
- The narration says *injected* wherever it says *caught*. It stays that way.

## What is real in this film

- Both settlements in shots 3 and 5 are real, zero-value, sponsored Base Sepolia
  self-transfers executed through KeeperHub during the capture.
- Every hash on screen resolves on a public explorer.
- The counters are read off the rendered DOM, not typed.
- The only synthetic elements are the drawn cursor, the title cards, and the
  audio bed. Nothing in the page is staged, mocked, or re-ordered.

---

## Build

```bash
pnpm exec tsx scripts/capture-demo.ts     # drives the live site, records 3840x2160
pnpm exec tsx scripts/generate-vo.ts      # per-paragraph VO + word alignment
pnpm exec tsx scripts/assemble-demo.ts    # cards, punches, mix, encode
```

`scripts/assemble-demo.ts` fails the build rather than speeding up audio if a
narration paragraph outruns the footage captured for it, and fails if the result
exceeds 2:45 or 100 MB.
