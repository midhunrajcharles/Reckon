# Reckon — demo film, shipped cut

**File:** `rec/reckon-demo.mp4` · **2:03.33** · 1920×1080 · 30fps · 2.39:1 letterbox
(138px bars) · H.264 crf 19 · AAC 192k · faststart
**Built by:** `rec/build.sh` (ffmpeg only)
**Picture source:** `rec/2026-08-13 14-08-07.mp4` — one continuous screen recording of
<https://reckon-bay.vercel.app>, captured 2026-08-13.
**Narration:** ElevenLabs, 123.33s, one take. Burned-in captions in the lower bar carry
the on-screen claims; the voice carries the argument.

> This document supersedes `demo/script.md`, which describes the earlier 2:19
> Playwright-captured film that was not shipped.

## Two rules the cut obeys

1. **Chronological.** No shot is re-ordered against the recording. `build.sh` pulls each
   shot by its timestamp in the source and the timestamps only ever move forward.
2. **Every shot is a crop, never a zoom.** Punch-ins are hard cuts to a crop region of
   the 4K-ish source. The three match-cut frames (12/13/14) are freezes of the *same
   source frame* at 64.40s, cropped to different regions — which is why the columns sit
   in identical screen positions.

## Narration text

Transcribed from the delivered audio (`rec/vo.json`). Bracketed words are ASR mangles
corrected against the product — the spoken audio is right, the transcript wasn't:

- "base supported" → **Base Sepolia**
- "VM" → **viem**
- "Mind confirmed" → **Mined, confirmed**
- "Retri-blocked" → **Retry blocked**
- "everyone reconciled" → **every one reconciled**

---

## ACT I — the lie · 0:00–0:15.4 · title cards, black

| # | In | Dur | Card |
|---|---|---|---|
| 01 | 0:00.00 | 3.00 | `3 AM` |
| 02 | 0:03.00 | 3.60 | `A payment agent fires a settlement.` / `It lands onchain.` |
| 03 | 0:06.60 | 3.90 | `The platform reports` / **`FAILED`** |
| 04 | 0:10.50 | 4.90 | `So the agent retries.` / `And pays twice.` |

> **¶** Three in the morning. A payment agent fires a settlement. It lands onchain. But
> the execution layer reports back — failed. So the agent retries, and pays twice.
> Nobody notices until the reconciliation the next day.

Cards, not footage, on purpose: the film spends its first fifteen seconds on the failure
before it shows a product. The word `FAILED` at 150pt is the largest thing in the film.

---

## ACT II — the product · 0:15.4–0:48.3 · live tape

| # | In | Dur | Source @ | Crop | Caption |
|---|---|---|---|---|---|
| 05 | 0:15.40 | 5.90 | 25.5s | 1720×720 | A settlement agent that does not believe its own execution layer |
| 06 | 0:21.30 | 5.80 | 51.2s | 1520×636 | 61 settled / 70 independently reconciled / 9 discrepancies caught |
| 07 | 0:27.10 | 2.70 | 52.6s | 1420×400 | Every attempt — what the platform reported, and what the chain actually held |
| 08 | 0:29.80 | 5.60 | 56.2s | 775×324 | Inject — the settlement lands onchain, but the agent is told it failed |
| 09 | 0:35.40 | 5.70 | 58.6s | 775×324 | **Real latency. Uncut.** |
| 10 | 0:41.10 | 3.60 | 63.2s | 1430×598 | Reckon reads the chain itself — viem, against an RPC KeeperHub does not operate |
| 11 | 0:44.70 | 3.60 | 65.0s | 1420×400 | One row. Two answers. |

> **¶ (05)** Reckon is a settlement agent that doesn't believe its own execution layer.
>
> **¶ (06–07)** Over 60 settlements, every one reconciled against the chain. Every
> injected failure caught. Zero double payments.
>
> **¶ (08–09)** Watch. We tell the agent its settlement failed. KeeperHub executed it —
> the transaction is on Base Sepolia right now. But the status says failed, so a normal
> agent retries here.
>
> **¶ (10–11)** Reckon doesn't. It reads the chain itself, with viem, against an RPC that
> KeeperHub does not operate.

Shot 09 is the honesty shot: the injection's real wait is left in and captioned as such.
Nothing is trimmed to make the agent look faster than it is.

---

## ACT III — the match cut · 0:48.3–0:58.9 · three freezes of source frame 64.40s

| # | In | Dur | Crop | Caption |
|---|---|---|---|---|
| 12 | 0:48.30 | 3.00 | 290×121 @ x=1010 | `REPORTED    failed` |
| 13 | 0:51.30 | 3.00 | 290×121 @ x=1290 | `CHAIN TRUTH    success, block 45421031` |
| 14 | 0:54.30 | 4.60 | 800×340 @ x=900 | `RETRY BLOCKED — one transaction, not two` |

> **¶** Reported: failed. Chain truth: success. Mined, confirmed. Retry blocked. One
> transaction, not two.

**This is the film.** Shots 12 and 13 are the same crop size at the same vertical
position, three hundred pixels apart on one frozen frame — identical framing, one word
different. The freeze is what makes it work: nothing on screen moves, so the only change
between the two frames is the answer. Re-word the narration and the cut loses its reason
to exist.

---

## ACT IV — the proof · 0:58.9–1:44.9

| # | In | Dur | Source @ | Caption |
|---|---|---|---|---|
| 15 | 0:58.90 | 5.82 | 113.0s (freeze) | **Not our dashboard. A public explorer we do not operate.** |
| 16 | 1:04.72 | 2.18 | 117.6s | Discrepancies caught 9 → 10 |
| 17 | 1:06.90 | 5.36 | 121.2s | Second failure mode — the first gas bid dies to an injected spike |
| 18 | 1:12.26 | 5.62 | 125.6s | Nothing sent. No hash. |
| 19 | 1:17.88 | 6.90 | 128.6s | Escalated, re-attempted, settled for real. Two rows, one settlement. |
| 20 | 1:24.78 | 12.52 | 150.0s | Every attempt is on the tape — simulate, idempotency key, execution status |
| 21 | 1:37.30 | 7.60 | 155.5s | Reported status is a hypothesis. Never truth. |

> **¶ (15)** That isn't our dashboard claiming success. That's the chain. Every hash on
> this tape opens.
>
> **¶ (16–19)** Second failure mode. The first gas bid dies to a spike. Reckon refuses to
> broadcast — nothing sent, no hash. Then it escalates the bid, and settles for real. Two
> rows, one settlement.
>
> **¶ (20–21)** Every settlement runs through KeeperHub's Direct Execution API. Simulate
> first, check `wouldRevert`. Then broadcast once, behind an idempotency key derived from
> the intent — so a duplicate request can never become a duplicate payment. Execution
> status is the audit trail, and it is treated as a hypothesis, never as truth.

Shot 15 is a freeze and holds 5.8s without any motion — the one shot whose job is *this
is not our claim*. Shot 20 is the longest in the film at 12.5s, because the surface list
(simulate → idempotency → execution status) is the criterion-2 answer and needs to be
read, not glimpsed.

Note 16: the discrepancy counter ticks **9 → 10** on camera. The counters in shot 06 (61
/ 70 / 9) and the closing card (62 / 72 / 10) differ for that reason — they were read at
different moments of the same run, not rounded.

---

## TAG · 1:44.9–2:03.33 · cards, black

| # | In | Dur | Card |
|---|---|---|---|
| 22 | 1:44.90 | 7.28 | `The failure conditions are injected.` / `We force the condition. The recovery, the reconciliation` / `and every transaction are real.` |
| 23 | 1:52.18 | 6.44 | `62 SETTLED ONCHAIN` / `72 INDEPENDENTLY RECONCILED` / `10 DISCREPANCIES CAUGHT` / **`ZERO DOUBLE PAYMENTS`** |
| 24 | 1:58.62 | 4.71 | `RECKON` / `Reported status is a hypothesis.` / `reckon-bay.vercel.app` / `KeeperHub — Agents Onchain` |

> **¶** To be exact: the failure conditions are injected. We force the condition — the
> recovery, the reconciliation, and every transaction are real. Over 50 settlements on
> Base Sepolia. 130 tests. And a regression test that pins the double-spend. Agents can
> already act. Reckon is how you prove what they did.

Card 22 exists so the disclosure is a full-screen card at 64pt, not a caption. It runs
*before* the results card, never after.

Video fades in 0.4s, out from 122.6s; audio fades out from 122.3s over 1.0s.

---

## Numbers spoken in the film

| Claim | Status |
|---|---|
| "Over 60 settlements" (¶ at 0:21) | Matches shot 06 caption, 61 settled |
| "Over 50 settlements on Base Sepolia" (tag) | Understates the closing card's 62 — safe as spoken |
| "130 tests" (tag) | **Understates the repo: `pnpm test` reports 143 tests, 12 files.** Left as recorded; a spoken figure below the true one is never a claim problem, but re-record this line if the VO is ever rebuilt |
| `block 45421031` (shot 13) | Read off the frozen frame, not typed |

## Rebuilding

```bash
cd rec && ./build.sh          # 24 shots -> picture.mp4 -> muxed reckon-demo.mp4
```

Shot durations are cut to the VO's own word timings (`rec/vo.json`) — nearly every shot
boundary lands on a sentence boundary in the narration. Changing a shot duration without
re-checking that file will drift picture against voice.

## Upload checklist (per the brief)

- Unlisted, **not** private
- Marked **Not for Kids**
- Link verified in a private window before it goes on the BUIDL
