# Reckon — screen recording script

The operator script for the take that became `rec/2026-08-13 14-08-07.mp4`, the single
continuous recording every shot in the shipped film is cropped out of.

Runtime of the take: **~2:45**. `rec/build.sh` uses 15 windows from it and discards the
rest. Nothing is re-ordered in post — the clock below is the film's chronology.

---

## Read this before you re-record

**`build.sh` crops by absolute pixel region.** `crop=1120:469:440:40` means *that
rectangle of a 1920×1080 desktop*. If the Chrome window sits anywhere else, is any other
size, or is at any other page zoom, **every shot in the film misses its target** and the
crop values must all be re-derived by hand. Match the geometry below exactly, or budget
an hour to re-crop.

## Pre-flight

| | |
|---|---|
| Capture | OBS, **full desktop**, 1920×1080, 30fps. Not window capture — the crops assume screen coordinates |
| Browser | Chrome, **maximized**, page zoom **100%** |
| Tab 1 | `reckon-bay.vercel.app` — the tape, scrolled to top, already loaded and settled |
| Tabs 2–4 | BaseScan tx pages for recent settled rows, pre-opened. They exist so the explorer beat doesn't wait on a cold load |
| BaseScan | Visit once first and dismiss the cookie banner. It sat in the bottom bar of the real take and only escaped by being outside the crop — don't rely on that |
| Worker | Standing worker running, so the tape has live history behind it |
| Desktop | Notifications off. The taskbar and clock are in frame and get cropped away, but a toast popping mid-shot is unrecoverable |
| Audio | None. Narration is added separately; record picture only |

Do not move the mouse in fast jumps. Travel to every button at a human rate, and **hover
~0.8s before each click** so the armed state lands in frame. Park the cursor off to the
side during holds.

---

## The take

Clock is elapsed time in the recording. Hold times are minimums — running long is free,
because `build.sh` picks its window out of the middle. Running short is not.

| Clock | Action | Hold |
|---|---|---|
| 0:00 | Start recording. Do nothing. Let the page sit | 25s |
| 0:25 | Tape at rest, hero and rows in frame | 6s |
| 0:31 | Slow scroll to the three counters. Settle, no drift | — |
| 0:51 | **Counters in frame** — settled / reconciled / discrepancies. Note the discrepancy number, you need it to tick later | 6s |
| 0:57 | Cursor travels to **INJECT REPORTED FAILURE**. Hover | 0.8s |
| 0:56–0:58 | **Click.** Hands off the mouse from here | — |
| 0:58 | **Wait out the real settlement.** Do not touch anything. This is a live broadcast + mine + reconcile — the latency is the point and it stays in the film uncut | until the row lands |
| 1:03 | New row renders: `REPORTED failed` · `CHAIN TRUTH success` · `RETRY BLOCKED`. **Freeze — absolutely still.** Three separate shots are cut from one frame here | 5s |
| 1:08 | Cursor to the row's **tx hash**. Hover, click. Explorer opens in a new tab | — |
| 1:08–1:53 | Let the explorer load fully. Status `Success`, block, from, to all visible. **Then stop moving** | 45s+ |
| 1:53 | Explorer at rest, nothing hovered | 6s |
| 1:57 | Back to the tape tab. Counters in frame — the discrepancy count has **ticked up by one** | 3s |
| 2:00 | Cursor to **INJECT GAS SPIKE**. Hover | 0.8s |
| 2:01 | **Click.** Hands off | — |
| 2:01–2:15 | Two rows appear: first attempt `NO BROADCAST` (no hash), second escalated to `SETTLED`. Hold both in frame together at the end | until both land |
| 2:15 | Slow continuous scroll down through settled history. Constant rate — any acceleration reads as padding | — |
| 2:30 | Stop on a section showing full attempt detail: simulate result, idempotency key, execution status | 13s |
| 2:35 | Small adjust so the reported/chain-truth columns sit clean in frame | 8s |
| 2:45 | Stop recording | — |

---

## Which windows the film actually uses

If you only re-shoot part of the take, these are the source timestamps `build.sh` reaches
for. Everything else in the recording is discarded.

| Source @ | Dur | Becomes | What must be on screen |
|---|---|---|---|
| 25.5s | 5.90 | shot 05 | Tape at rest |
| 51.2s | 5.80 | shot 06 | All three counters |
| 52.6s | 2.70 | shot 07 | Tape rows, reported + chain-truth columns |
| 56.2s | 5.60 | shot 08 | The inject click |
| 58.6s | 5.70 | shot 09 | The wait — captioned "Real latency. Uncut." |
| 63.2s | 3.60 | shot 10 | Row resolving |
| **64.4s** | freeze | shots **12, 13, 14** | **One frame, three crops.** Reported column, chain-truth column, retry-blocked stamp. The film's whole thesis is this frame |
| 65.0s | 3.60 | shot 11 | The full row |
| **113.0s** | freeze | shot 15 | BaseScan: `Success`, block, from/to. Held 5.8s dead still |
| 117.6s | 2.18 | shot 16 | Counters, discrepancy incremented |
| 121.2s | 5.36 | shot 17 | Gas spike click |
| 125.6s | 5.62 | shot 18 | `NO BROADCAST`, no hash |
| 128.6s | 6.90 | shot 19 | Escalated row settled, both rows in frame |
| 150.0s | 12.52 | shot 20 | Attempt detail — simulate, idempotency, execution status |
| 155.5s | 7.60 | shot 21 | Reported vs chain-truth columns |

Shot 12/13 are 290×121 crops taken 280px apart on the same frozen frame — identical
framing, one word different. If that row is mid-animation at 64.4s, the match cut dies.
Hold still through it.

## Rules the take obeys

- **Proof beats run at real speed.** Injection waits and explorer loads are never trimmed.
- **No cut may make a failure read as a success, or the reverse.**
- Numbers on screen are whatever the live site says at that moment. The counters differ
  between shot 06 and the closing card because they genuinely moved during the take.
- The failures are injected, and the film says so on a full-screen card before the
  results card — not after.

## After the take

```bash
cd rec && ./build.sh          # 24 shots -> picture.mp4 -> muxed reckon-demo.mp4
```

Then verify the frame the film depends on before trusting the build:

```bash
ffmpeg -i "rec/<take>.mp4" -ss 64.4 -frames:v 1 rec/check.png
```

Shot list, captions and narration for the assembled film: `demo/final-cut.md`.
