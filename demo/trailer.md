# Reckon — trailer

Runtime target **1:12** · 1920×1080 · H.264 · 2.39:1 letterbox throughout.

This is not a shorter version of `demo/script.md`. The film explains. **The trailer
withholds.** It states the crime, shows one piece of evidence, and leaves.

Cuttable **entirely from the existing capture** — `demo/capture/raw.webm` at
3840×2160, marked in `demo/capture/marks.json`. No new capture required. Every
punch-in below is a true crop of that 4K source, never an upscale.

---

## Numbers policy (inherited, non-negotiable)

No figure is written as a literal. Tokens resolve from `marks.json` at render
time; an unresolvable token **fails the build** rather than falling back.

| Token | Source | Value at last capture |
|---|---|---|
| `{{settledAfter}}` | `evidence.countersAtEnd["Settled onchain"]` | 61 |
| `{{reconciledAfter}}` | `evidence.countersAtEnd["Attempts reconciled"]` | 70 |
| `{{discrepanciesAfter}}` | `evidence.countersAtEnd["Discrepancies caught"]` | 9 |

`zero` is the one hard-typed number in this script. It is hard-typed because it is
structural: the ledger has never recorded a second attempt on a settled intent, and
if it ever does, the trailer is wrong and must be recut. Do not tokenise it.

---

## Sound design

The trailer is built on **three impacts and one absence**. Everything else serves them.

| Layer | Treatment |
|---|---|
| Bed | Single sustained sub, ~40Hz, from 00:04. No melody. Never resolves. |
| Ticks | Sparse clock tick under Act I only. Stops dead at 00:26. Never returns. |
| Impact 1 | 00:26 — the mismatch. Low, dry, no tail. |
| Impact 2 | 00:53 — `RETRY BLOCKED` stamp. Frame-synced. |
| Impact 3 | 01:02 — the counter card. Biggest of the three. |
| The absence | 00:59.5–01:01.5. Two full seconds of **true digital silence**. Not a dip — zero. |
| VO | Dominant. Nothing plays under a word. |

Never speed audio to hit runtime. Cut picture instead.

---

## Shot list

### ACT I — THE LIE

**00:00 · BLACK.** Silence. 1.5s. Nothing on screen. Let the room go quiet.

**00:01.5 · CARD** — Instrument Serif, white on black, centered:

> `A payment platform told an agent the transaction failed.`

Hold 2.5s. Ticks fade in under the last second.

**00:04 · CARD**

> `It hadn't.`

Hold 1.5s. Sub enters on the cut. Hard cut out.

**00:05.5 · SHOT A — THE ROW** · source `blockedRow`

Open mid-tape on the **RETRY BLOCKED** row, red seam visible, slightly off-center —
the frame should feel like something was found, not composed. Ken Burns 1.00 → 1.04.

> **VO 1** — An agent that believes the report retries the payment.

**00:11 · PUNCH 2.4×** to the `failed` cell in the **REPORTED** column. Hold 1.2s.

> **VO 2** — And pays twice.

**00:14 · CARD**

> `THE PLATFORM SAID IT FAILED.`

1.5s. Ticks getting louder underneath.

---

### ACT II — THE CHECK

**00:15.5 · SHOT B — THE INJECTION** · source `reportedFailure` (from click)

Cursor travels to **INJECT REPORTED FAILURE**. Hover — the armed state must read.
Click. Cut wide as the row lands.

> **VO 3** — So a second agent checks.

**00:19 · THE WAIT.** Real latency, **uncut** — 4.6s in the current capture. Ken Burns
continues. No VO. Ticks only. This is the tension beat; do not trim it, and do not
fill it. If the recaptured wait runs longer, keep it and pull 1s from Act III's
montage instead.

> **VO 4** — Not the platform's word for it. The chain itself.

**00:24 · PUNCH** to **REPORTED**: `failed`, struck through. Hold 1.3s.

> **VO 5** — Reported: failed.

**00:26 · MATCH CUT** to **CHAIN TRUTH** — *identical crop size, identical screen
position, one word different*: `success · block 45386595`. **Impact 1 lands on the
cut. The ticks stop on the same frame.**

> **VO 6** — Chain: success.

> The whole trailer is this cut. Two frames, one word apart. Everything before it
> exists to make it land and everything after it is consequence. If the match is
> off by a pixel or the impact is off by a frame, recut it — nothing else in this
> edit is worth protecting at its expense.

Hold the second frame 2s in silence except the sub.

**00:29 · SHOT C — THE EXPLORER** · source `basescan`

Cursor clicks the hash. A public explorer opens — one nobody in this project
operates. **Absolute stillness.** No Ken Burns, no punch, no cursor in frame.
Hold 4s on the confirmed transaction.

> **VO 7** — Fetched independently, from a node the platform doesn't run.

> Motion here would undercut the only shot whose entire job is *this is not our claim*.

---

### ACT III — THE MONTAGE

Cut rate roughly doubles. Hard cuts only — no dissolves anywhere in this act.

**00:35 · SHOT D — NO BROADCAST** · source `gasSpike`

Two rows land. Punch to the **NO BROADCAST** verdict, `nothing sent — no hash`.
Hold 1.4s.

> **VO 8** — A gas spike kills the bid. Nothing is sent.

**00:38 · PUNCH** to the escalated row, `retry:gas_escalated` → **SETTLED**. 1.2s.

> **VO 9** — It escalates, re-attempts, and settles for real.

**00:41 · PULL BACK** — both rows in one frame. 1.5s. No VO. Let the pair read.

**00:43 · SHOT E — THE SCROLL** · source `settledHistory`

Fast, constant scroll through the settled history. Dozens of green **SETTLED**
stamps flowing past. No Ken Burns — the scroll is the motion. 6s.

> **VO 10** — Every attempt is on the tape. What the platform reported. What the
> chain actually held.

**00:49 · SLAM TO A STILL FRAME** — a red-ruled row, mid-scroll, motion stopped dead
as if the scroll hit something.

> **VO 11** — And every time those disagreed —

**00:53 · PUNCH** to **RETRY BLOCKED**. **Impact 2, frame-synced to the stamp.**

> **VO 12** — — the retry never went out.

**00:56 · CARD** — white on black, held 3.5s:

> `One transaction, not two.`

**00:59.5 · BLACK. TOTAL SILENCE. 2s.**

> Two seconds is long. It will feel like a mistake in the edit bay. Keep it. It is
> the only thing in the trailer that makes the last card land as a verdict instead
> of a stat.

---

### TAG

**01:01.5 · CARD** — numerals large, labels small beneath. **Impact 3 on the cut.**

> `{{settledAfter}} SETTLED ONCHAIN`
> `{{reconciledAfter}} INDEPENDENTLY RECONCILED`
> `{{discrepanciesAfter}} DISCREPANCIES CAUGHT`
> `ZERO DOUBLE PAYMENTS`

Hold 4s. Sub swells and cuts out clean on the last frame.

**01:05.5 · FINAL CARD**

> `RECKON` — large
> `Reported status is a hypothesis.` — small, beneath
> `reckon-bay.vercel.app` — smaller still

Hold 5s. Fade to black. Silence.

**01:12 · END.**

Optional single line, bottom-left of the final card, small: `KeeperHub · Agents
Onchain`. Include it only if the trailer plays anywhere the hackathon context is
not already established.

---

## VO direction

Ten lines, ~55 words total. The film explains; **the trailer must not**.

- Flat, unhurried, quiet. Closer to a police statement than a pitch. The material is
  dramatic on its own — any performance on top of it reads as overselling.
- Never rush a line to fit. Cut picture.
- **"Reported: failed." / "Chain: success."** are the load-bearing lines. Same pitch,
  same pace, same weight — the contrast lives in the words, not the delivery. Reword
  either one and the match cut has no reason to exist.
- Leave the gaps. Roughly half this trailer has no voice in it.

---

## Honesty constraints — inherited from the film, non-negotiable

- Both settlements shown are real, zero-value, gas-sponsored Base Sepolia
  self-transfers executed through KeeperHub during the capture.
- Every hash on screen resolves on a public explorer. The one shown is
  `0x55afeac5…df735d`, block 45386595.
- Counters are read off the rendered DOM, never typed.
- **No cut may make a failure read as a success, or the reverse.** The trailer cuts
  faster than the film; that speed must never be used to blur a verdict.
- Chaos rows keep their `chaos:…` trigger visible in every wide shot they appear in.
  Do not crop the trigger out of frame to tighten a punch-in.
- Proof beats run at real speed. The 4.6s wait stays.
- Synthetic elements, in full: the drawn cursor, the title cards, the audio. Nothing
  in the page is staged, mocked, or re-ordered.

---

## 0:30 cut-down (social)

Same source, same rules. Drop Act I's setup cards and the explorer shot.

| In | Out | Content |
|---|---|---|
| 00:00 | 00:02 | Card: `A payment platform said the transaction failed. It hadn't.` |
| 00:02 | 00:07 | Shot A wide → punch to `failed` |
| 00:07 | 00:12 | Injection + the real wait, uncut |
| 00:12 | 00:16 | **REPORTED → CHAIN TRUTH match cut.** Impact. |
| 00:16 | 00:20 | Punch to `RETRY BLOCKED`. Impact. |
| 00:20 | 00:23 | Card: `One transaction, not two.` |
| 00:23 | 00:24 | Black. Silence. |
| 00:24 | 00:30 | Counter card → `RECKON` + URL |

The explorer shot is the first thing to go and the match cut is the last — if the
cut-down needs to lose another second, take it from the scroll, never from the wait.

---

## Build

```bash
pnpm exec tsx scripts/assemble-demo.ts --edl demo/trailer.edl.json
```

The trailer is an edit of footage that already exists. Recapture only if the tape
changes materially — and if it does, the tokens above resolve to the new counters
automatically, while `zero` must be re-verified against the ledger by hand.
