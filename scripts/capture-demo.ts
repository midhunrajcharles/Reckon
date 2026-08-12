/**
 * Deterministic demo capture for the Reckon submission film.
 *
 * Drives the LIVE deployment with Playwright and records the page itself
 * (CDP screencast, not the desktop) at 2x device scale — a 3840x2160 source,
 * so the film's 2.4x punch-ins are true crops rather than upscales.
 *
 * Two things are written alongside the video:
 *   marks.json .marks    — shot boundaries against the video clock
 *   marks.json .targets  — the BOUNDING BOX of every punch-in subject, in CSS
 *                          px, measured on the frame it is valid for. The edit
 *                          derives every crop from these; no pixel coordinate
 *                          is ever hand-authored in the assembler.
 *
 * The two chaos clicks perform REAL, zero-value, sponsored Base Sepolia
 * self-transfers through KeeperHub — the same shape as every other attempt on
 * the tape. Nothing here is mocked and nothing is staged.
 *
 *   pnpm exec tsx scripts/capture-demo.ts
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdir, writeFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

const URL = "https://reckon-bay.vercel.app";
const OUT_DIR = join(process.cwd(), "demo", "capture");

/** CSS viewport. The video is this x DEVICE_SCALE. */
const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE = 2;
const VIDEO_SIZE = { width: VIEWPORT.width * DEVICE_SCALE, height: VIEWPORT.height * DEVICE_SCALE };

/**
 * Where the cursor rests during a hold. Bottom-right gutter: on screen, so the
 * hand is still present, but off every column of the tape.
 */
const PARK = { x: 1878, y: 1006 };

/** Hover dwell before every click, so the button's armed state reads on video. */
const HOVER_MS = 800;

/** Human pointer rate, px/sec. Travel time is distance-derived, not fixed. */
const POINTER_PX_PER_S = 750;

/**
 * Hold lengths, in seconds, from the shot list, plus PAD.
 *
 * The pad exists so the edit can trim a section DOWN to its narration length;
 * audio is never sped up to fit a short hold, so every hold must outlast its
 * paragraph. Punch-ins are cut from this same hold footage, so a shot with N
 * punches needs its narration length plus the punch hold time on top.
 */
const PAD_S = 8;
const HOLD = {
  blockedRow: 20, // ¶1 17s + a 2s punch
  counters: 16, // ¶2 13s + a 1.5s punch
  reportedFailure: 34, // ¶3 28s + four punches; the injection wait is extra, and real
  basescan: 14, // ¶4 8s, held dead still
  gasSpike: 20, // ¶5 15s + two punches
  settledHistory: 24, // ¶6 22s, one continuous scroll
  fullPage: 26, // ¶7 24s + the fade
} as const;

type ShotName = keyof typeof HOLD;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Target extends Box {
  atMs: number;
  scrollY: number;
}

const marks: Array<{ shot: string; startMs: number; endMs: number; specHoldS: number }> = [];
const targets: Record<string, Record<string, Target>> = {};
let t0 = 0;

const now = (): number => Date.now() - t0;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A shot: log its real start/end against the video clock. */
async function shot(name: ShotName, body: () => Promise<void>): Promise<void> {
  const startMs = now();
  await body();
  await sleep((HOLD[name] + PAD_S) * 1000);
  const endMs = now();
  marks.push({ shot: name, startMs, endMs, specHoldS: HOLD[name] });
  const secs = ((endMs - startMs) / 1000).toFixed(1);
  console.log(
    `  [shot] ${name.padEnd(18)} ${(startMs / 1000).toFixed(1)}s → ${(endMs / 1000).toFixed(1)}s (${secs}s)`,
  );
}

/**
 * A visible cursor. Playwright's video does not draw the pointer, so without
 * this every click reads as the page changing on its own.
 */
const CURSOR_SCRIPT = `
  (() => {
    const install = () => {
      if (document.getElementById('__cursor')) return;
      const style = document.createElement('style');
      style.textContent = \`
        #__cursor {
          position: fixed; left: 0; top: 0; z-index: 2147483647;
          width: 26px; height: 26px; margin: -13px 0 0 -13px;
          border: 2.5px solid rgba(20,20,20,.85); border-radius: 50%;
          background: rgba(20,20,20,.14);
          box-shadow: 0 0 0 1.5px rgba(255,255,255,.75), 0 2px 10px rgba(0,0,0,.30);
          pointer-events: none; will-change: transform;
          transition: width .1s, height .1s, background .1s, opacity .2s;
        }
        #__cursor::after {
          content: ''; position: absolute; left: 50%; top: 50%;
          width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%;
          background: rgba(20,20,20,.95);
        }
        #__cursor.__down { background: rgba(20,20,20,.34); width: 20px; height: 20px; }
        #__cursor.__hidden { opacity: 0; }
        .__ripple {
          position: fixed; z-index: 2147483646; width: 14px; height: 14px;
          margin: -7px 0 0 -7px; border: 2.5px solid rgba(20,20,20,.6);
          border-radius: 50%; pointer-events: none;
          animation: __rip .55s ease-out forwards;
        }
        @keyframes __rip { to { transform: scale(4.2); opacity: 0; } }
      \`;
      document.head.appendChild(style);
      const dot = document.createElement('div');
      dot.id = '__cursor';
      document.body.appendChild(dot);

      addEventListener('mousemove', (e) => {
        dot.style.transform = \`translate(\${e.clientX}px, \${e.clientY}px)\`;
      }, true);
      addEventListener('mousedown', (e) => {
        dot.classList.add('__down');
        const r = document.createElement('div');
        r.className = '__ripple';
        r.style.left = e.clientX + 'px';
        r.style.top = e.clientY + 'px';
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 600);
      }, true);
      addEventListener('mouseup', () => dot.classList.remove('__down'), true);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  })();
`;

/** Last known pointer position, so travel time can be distance-derived. */
let pointer = { x: PARK.x, y: PARK.y };

/**
 * Move the pointer at a human rate. Playwright's `steps` interpolation is
 * linear, so the ease is applied by hand — a fast middle with feathered ends
 * reads as a hand, where constant velocity reads as a machine.
 */
async function glide(page: Page, x: number, y: number): Promise<void> {
  const dist = Math.hypot(x - pointer.x, y - pointer.y);
  const ms = Math.max(260, (dist / POINTER_PX_PER_S) * 1000);
  const steps = Math.max(14, Math.round(ms / 16));
  const from = { ...pointer };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // easeInOutCubic
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(ms / steps);
  }
  pointer = { x, y };
}

/** Park the cursor out of the content during a hold. */
async function park(page: Page): Promise<void> {
  await glide(page, PARK.x, PARK.y);
}

/** Hide the drawn cursor entirely — for shots that must be dead still. */
async function hideCursor(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    document.getElementById("__cursor")?.classList.toggle("__hidden", h as boolean);
  }, hidden);
}

/** Travel to an element, dwell so its armed state reads, then click it. */
async function hoverClick(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("hoverClick: target has no box");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(HOVER_MS);
  await target.click({ position: { x: box.width / 2, y: box.height / 2 } });
}

/**
 * Wheel-driven scroll. The page runs Lenis, so real wheel deltas produce the
 * site's own eased motion — a scripted scrollTo would bypass it and look wrong.
 */
async function wheelTo(page: Page, targetY: number, durationMs = 2500): Promise<void> {
  const steps = Math.max(10, Math.round(durationMs / 40));
  for (let i = 0; i < steps; i++) {
    const y = await page.evaluate(() => window.scrollY);
    const remaining = targetY - y;
    if (Math.abs(remaining) < 12) break;
    await page.mouse.wheel(0, Math.sign(remaining) * Math.max(24, Math.abs(remaining) * 0.16));
    await sleep(40);
  }
  await sleep(700); // let Lenis settle
}

/**
 * A constant-rate scroll. `wheelTo` eases toward its target, which is right for
 * arriving at a frame and wrong for the archive shot — the shot list is explicit
 * that any acceleration there reads as padding.
 */
async function scrollSteady(page: Page, deltaY: number, durationMs: number): Promise<void> {
  const tick = 40;
  const steps = Math.round(durationMs / tick);
  const per = deltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, per);
    await sleep(tick);
  }
}

/** Absolute document Y that puts `sel` at `fromTop` px down the viewport. */
async function yFor(page: Page, sel: string, fromTop = 220): Promise<number> {
  return page.evaluate(
    ([s, off]) => {
      const el = document.querySelector(s as string);
      if (!el) throw new Error(`no element for ${s}`);
      return Math.max(0, window.scrollY + el.getBoundingClientRect().top - (off as number));
    },
    [sel, fromTop] as const,
  );
}

/**
 * Record a punch-in subject's geometry on the frame it is valid for.
 *
 * The assembler turns these into crops. Measuring them here — rather than
 * eyeballing coordinates during the edit — is what keeps the match cut honest
 * when the page reflows or a row's height changes between captures.
 */
async function markTarget(page: Page, shotName: string, key: string, target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`markTarget: no box for ${shotName}.${key}`);
  const scrollY = await page.evaluate(() => window.scrollY);
  const t: Target = { x: box.x, y: box.y, w: box.width, h: box.height, atMs: now(), scrollY };
  (targets[shotName] ??= {})[key] = t;
  console.log(
    `    ↳ target ${shotName}.${key.padEnd(14)} ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`,
  );
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/** Read the counters as rendered, so the narration can be checked against them. */
async function readCounters(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll("#ledger > div").forEach((tile) => {
      const label = tile.querySelector(".micro")?.textContent?.trim();
      const value = tile.querySelector("span:last-child")?.textContent?.trim();
      if (label && value) out[label] = value;
    });
    return out;
  });
}

/** A tape row's cells, by grid position. Matches TapeRowView's column order. */
const CELL = {
  intent: "> div:nth-child(1)",
  simulation: "> div:nth-child(2)",
  attempt: "> div:nth-child(3)",
  reported: "> div:nth-child(4)",
  chainTruth: "> div:nth-child(5)",
  verdict: "> div:nth-child(6)",
} as const;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch({ channel: "chromium", headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    reducedMotion: "no-preference", // Lenis + the stamp animations must run
    recordVideo: { dir: OUT_DIR, size: VIDEO_SIZE },
  });
  await context.addInitScript(CURSOR_SCRIPT);

  const page: Page = await context.newPage();
  t0 = Date.now(); // the video clock starts with the page
  const evidence: Record<string, unknown> = {};

  console.log(
    `\nCapturing ${URL} — ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE}x → ${VIDEO_SIZE.width}x${VIDEO_SIZE.height}\n`,
  );

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator("#tape li").first().waitFor({ timeout: 60_000 });
  await page.mouse.move(PARK.x, PARK.y);
  await sleep(1500);

  // ── Shot 1 — open on a RETRY BLOCKED row ────────────────────────────────
  const blockedRow = page.locator("#tape li").filter({ hasText: "RETRY BLOCKED" }).first();
  await blockedRow.waitFor({ timeout: 30_000 });
  await shot("blockedRow", async () => {
    const y = await page.evaluate(() => {
      const row = [...document.querySelectorAll("#tape li")].find((li) =>
        li.textContent?.includes("RETRY BLOCKED"),
      );
      if (!row) throw new Error("no RETRY BLOCKED row");
      // Centre the row: the red seam has to sit in the middle of frame.
      return Math.max(0, window.scrollY + row.getBoundingClientRect().top - 470);
    });
    await wheelTo(page, y, 3000);
    await park(page);
    // ¶1's punch: the caption that contradicts the narration.
    await markTarget(page, "blockedRow", "caption", blockedRow.locator("p.sentence").first());
    await markTarget(page, "blockedRow", "row", blockedRow);
    evidence.blockedRowText = (await blockedRow.innerText()).replace(/\s+/g, " ").trim();
  });

  // ── Shot 2 — smooth scroll up to the counters ───────────────────────────
  await shot("counters", async () => {
    await wheelTo(page, await yFor(page, "#ledger", 240), 4200);
    await park(page);
    await markTarget(page, "counters", "discrepancies", page.locator("#ledger > div").nth(2));
    await markTarget(page, "counters", "all", page.locator("#ledger"));
    evidence.countersAtCapture = await readCounters(page);
    console.log("  counters on screen:", JSON.stringify(evidence.countersAtCapture));
  });

  // ── Shot 3 — INJECT REPORTED FAILURE, hold on the new row ───────────────
  await shot("reportedFailure", async () => {
    await wheelTo(page, await yFor(page, "#method", 260), 2200);
    const failBtn = page.locator("#method button").first();
    await hoverClick(page, failBtn);
    const clickedAtMs = now();
    await park(page);

    // The edit trims the approach scroll but never the latency, so it needs to
    // know exactly where the click was on the video clock.
    evidence.reportedFailureClickedAtMs = clickedAtMs;

    // The scenario broadcasts for real, then verifies. The wait is part of the
    // film — the shot list forbids trimming it — so it is recorded, not cut.
    const status = page.locator('p[role="status"]');
    await status.waitFor({ timeout: 150_000 });
    const statusText = (await status.innerText()).trim();
    evidence.reportedFailureStatus = statusText;
    const taskId = statusText.match(/demo-failure-\d+/)?.[0];
    if (!taskId) throw new Error(`no taskId in status: ${statusText}`);
    evidence.reportedFailureTaskId = taskId;
    evidence.reportedFailureLatencyMs = now() - clickedAtMs;
    console.log(`  scenario landed: ${taskId} (+${((now() - clickedAtMs) / 1000).toFixed(1)}s)`);

    const row = page.locator("#tape li").filter({ hasText: taskId }).first();
    await row.waitFor({ timeout: 30_000 });
    await wheelTo(page, await yFor(page, "#tape", 210), 2600);
    await park(page);

    // The row landed at this point on the video clock; the edit places every
    // ¶3 punch after it, never before.
    (evidence as Record<string, unknown>).reportedFailureRowVisibleAtMs = now();

    // The four ¶3 punches. `reported` and `chainTruth` are the match cut: the
    // assembler frames both with one crop size so the cells land in the same
    // place on screen and only the word changes.
    await markTarget(page, "reportedFailure", "reported", row.locator(CELL.reported));
    await markTarget(page, "reportedFailure", "chainTruth", row.locator(CELL.chainTruth));
    await markTarget(page, "reportedFailure", "stamp", row.locator(".stamp").first());
    await markTarget(page, "reportedFailure", "caption", row.locator("p.sentence").first());
    await markTarget(page, "reportedFailure", "row", row);

    evidence.reportedFailureRowText = (await row.innerText()).replace(/\s+/g, " ").trim();
  });

  // ── Shot 4 — the hash, resolved on an independent explorer ──────────────
  await shot("basescan", async () => {
    const taskId = evidence.reportedFailureTaskId as string;
    const row = page.locator("#tape li").filter({ hasText: taskId }).first();
    const link = row.locator('a[href*="basescan"]').first();
    await link.waitFor({ timeout: 20_000 });
    const href = await link.getAttribute("href");
    if (!href) throw new Error("tape row has no explorer link");
    evidence.rowLinkHref = href;

    const txHash = href.split("/tx/")[1];
    evidence.txHash = txHash;

    // The punch onto the hash, so it is readable at laptop size.
    await markTarget(page, "basescan", "hash", link);

    // Same tab: a new tab would start a second video file and break the take.
    await link.evaluate((a: HTMLAnchorElement) => a.removeAttribute("target"));
    await hoverClick(page, link);
    await sleep(900); // the click and the navigation starting, on camera

    /*
     * BaseScan serves a Cloudflare interstitial to automated browsers — the
     * first capture recorded "Just a moment…" where the transaction should
     * have been. Blockscout is an independent public explorer that loads
     * clean, and shows the same hash, block and status. Documented in
     * demo/script.md; the row's own link is NOT altered.
     */
    const explorerUrl = `https://base-sepolia.blockscout.com/tx/${txHash}`;
    evidence.explorerUrl = explorerUrl;
    await page.goto(explorerUrl, { waitUntil: "domcontentloaded" });
    await sleep(4000); // explorer paint

    // Strip the ad rail — it is not evidence and it dates the footage.
    evidence.adsHidden = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('[class*="Ad"],[id*="ad-"],iframe').forEach((el) => {
        (el as HTMLElement).style.display = "none";
        n++;
      });
      return n;
    });

    // This shot is held dead still — the drawn cursor would be the only motion.
    await hideCursor(page, true);
    await sleep(600);

    evidence.explorerTitle = await page.title();
    evidence.explorerBody = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    console.log(`  explorer: ${explorerUrl}`);
  });

  // ── Shot 5 — back, INJECT GAS SPIKE, hold on both rows ──────────────────
  await shot("gasSpike", async () => {
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.locator("#tape li").first().waitFor({ timeout: 60_000 });
    await hideCursor(page, false);
    pointer = { x: PARK.x, y: PARK.y };
    await page.mouse.move(PARK.x, PARK.y);
    await sleep(2000);

    await wheelTo(page, await yFor(page, "#method", 260), 2600);
    const gasBtn = page.locator("#method button").nth(1);
    await hoverClick(page, gasBtn);
    evidence.gasSpikeClickedAtMs = now();
    await park(page);

    const status = page.locator('p[role="status"]');
    await status.waitFor({ timeout: 150_000 });
    const statusText = (await status.innerText()).trim();
    evidence.gasSpikeStatus = statusText;
    const taskId = statusText.match(/demo-gas-\d+/)?.[0];
    if (!taskId) throw new Error(`no taskId in status: ${statusText}`);
    evidence.gasSpikeTaskId = taskId;
    console.log(`  scenario landed: ${taskId}`);

    const rows = page.locator("#tape li").filter({ hasText: taskId });
    await rows.first().waitFor({ timeout: 30_000 });
    await wheelTo(page, await yFor(page, "#tape", 200), 2600);
    await park(page);

    // The gas-spike scenario writes two rows: the refused bid (no broadcast)
    // and the escalated retry that settled. Both punches come off them.
    const count = await rows.count();
    evidence.gasSpikeRowCount = count;

    const settledRow = rows.filter({ hasText: "SETTLED" }).first();
    const noBroadcastRow = rows.filter({ hasText: "NO BROADCAST" }).first();

    if (await noBroadcastRow.count()) {
      await markTarget(page, "gasSpike", "noBroadcast", noBroadcastRow.locator(".stamp").first());
      await markTarget(page, "gasSpike", "noBroadcastTruth", noBroadcastRow.locator(CELL.chainTruth));
    } else {
      console.warn("  ! no NO BROADCAST row — the ¶5 first punch has no subject");
    }
    if (await settledRow.count()) {
      await markTarget(page, "gasSpike", "settled", settledRow.locator(".stamp").first());
    } else {
      console.warn("  ! no SETTLED row — the ¶5 second punch has no subject");
    }
    // The pull-back framing: both rows together.
    await markTarget(page, "gasSpike", "bothRows", page.locator("#tape ul"));

    evidence.gasSpikeRowsText = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  });

  // ── Shot 6 — slow constant scroll through the settled history ───────────
  await shot("settledHistory", async () => {
    await hideCursor(page, true); // the scroll is the motion; nothing else moves
    // Constant rate, deliberately unhurried: this shot is the archive.
    await scrollSteady(page, 2600, 21_000);
  });

  // ── Shot 7 — pull back to the full page ─────────────────────────────────
  await shot("fullPage", async () => {
    await hideCursor(page, false);
    await wheelTo(page, 0, 5200);
    await park(page);
    evidence.countersAtEnd = await readCounters(page);
    console.log("  counters at end:", JSON.stringify(evidence.countersAtEnd));
  });

  const totalMs = now();
  await context.close(); // flushes the video
  await browser.close();

  // Playwright names videos by a random id — give it a stable name.
  const files = await readdir(OUT_DIR);
  const webm = files.find((f) => f.endsWith(".webm") && f !== "raw.webm");
  if (webm) await rename(join(OUT_DIR, webm), join(OUT_DIR, "raw.webm"));

  await writeFile(
    join(OUT_DIR, "marks.json"),
    JSON.stringify(
      {
        url: URL,
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE,
        videoSize: VIDEO_SIZE,
        padSeconds: PAD_S,
        totalMs,
        marks,
        targets,
        evidence,
      },
      null,
      2,
    ),
  );

  console.log(`\nCapture complete — ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  video  ${join(OUT_DIR, "raw.webm")}`);
  console.log(`  marks  ${join(OUT_DIR, "marks.json")}\n`);
}

main().catch((err) => {
  console.error("\nCapture failed:", err);
  process.exit(1);
});
