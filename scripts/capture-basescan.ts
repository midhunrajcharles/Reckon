/**
 * Re-shoot of the explorer shot only.
 *
 * The first take held for 20s on a Cloudflare interstitial: sepolia.basescan.org
 * challenges automated browsers, and no reasonable amount of UA or profile
 * work got past it. Rather than defeat a bot wall, this shot uses Blockscout —
 * a different explorer, run by a different operator, which is if anything a
 * better witness for a project whose whole claim is independent verification.
 *
 * The site's own links point at BaseScan, so this navigates to Blockscout
 * directly rather than faking a click on a link that goes somewhere else. The
 * lead-in frames the hash on the real tape row; the hold is the explorer
 * resolving that same hash.
 *
 * It broadcasts NOTHING — the row already exists from the main take.
 *
 *   pnpm exec tsx scripts/capture-basescan.ts [taskId]
 */
import { chromium } from "playwright";
import { mkdir, writeFile, readdir, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHROME_UA, CURSOR_SCRIPT, LAUNCH_ARGS, VIEWPORT,
  glide, sleep, wheelTo, yFor,
} from "./capture-lib.js";

const URL = "https://reckon-bay.vercel.app";
const OUT_DIR = join(process.cwd(), "demo", "capture");
const HOLD_S = 20;
const PAD_S = 7;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // Default to the row the main take created, so the shot matches the story.
  let taskId = process.argv[2];
  if (!taskId) {
    const main = JSON.parse(await readFile(join(OUT_DIR, "marks.json"), "utf8"));
    taskId = main.evidence?.reportedFailureTaskId;
  }
  if (!taskId) throw new Error("no taskId — pass one, or run capture-demo.ts first");

  const browser = await chromium.launch({
    channel: "chromium",
    headless: false, // headless UA gets challenged; this is the whole point
    args: LAUNCH_ARGS,
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    userAgent: CHROME_UA,
    locale: "en-US",
    reducedMotion: "no-preference",
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);

  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const evidence: Record<string, unknown> = { taskId };

  console.log(`\nRe-shooting the explorer shot for ${taskId}\n`);

  // ── Setup, before the shot clock starts ─────────────────────────────────
  await page.goto(URL, { waitUntil: "networkidle" });
  const row = page.locator("#tape li").filter({ hasText: taskId }).first();
  await row.waitFor({ timeout: 60_000 });
  await wheelTo(page, await yFor(page, "#tape", 200), 2600);
  await sleep(1200);

  const link = row.locator('a[href*="basescan"]').first();
  await link.waitFor({ timeout: 20_000 });
  const siteHref = await link.getAttribute("href");
  const txHash = siteHref?.match(/0x[0-9a-f]{64}/i)?.[0];
  if (!txHash) throw new Error(`no tx hash in row link: ${siteHref}`);
  const explorerUrl = `https://base-sepolia.blockscout.com/tx/${txHash}`;
  Object.assign(evidence, { txHash, siteHref, explorerUrl });

  // ── Shot starts here: frame the hash, then the explorer, then hold ──────
  const startMs = now();
  const box = await link.boundingBox();
  if (box) await glide(page, box.x + box.width / 2, box.y + box.height / 2, 1500);
  await sleep(1200);

  await page.goto(explorerUrl, { waitUntil: "domcontentloaded" });
  // Fail loudly rather than hold on an interstitial again.
  await page.waitForFunction(
    () =>
      !/just a moment|attention required|security verification/i.test(
        document.title + " " + (document.body?.innerText ?? "").slice(0, 400),
      ) && /transaction/i.test(document.body?.innerText ?? ""),
    undefined,
    { timeout: 60_000, polling: 500 },
  );
  await sleep(3000); // explorer paint

  /**
   * Blockscout sells a banner slot in the middle of the details table and it
   * served a gambling ad. Hide the banner image only — matched on rendered
   * width, never on surrounding text, because a text match here caught a
   * container and blanked the whole transaction table. The "Sponsored" label
   * stays: the ad slot is visibly a slot, and no explorer data is touched.
   */
  // The slot lazy-loads well after the table paints, so a one-off sweep misses
  // it. Install an observer that keeps it hidden for the whole hold.
  // Passed as source text, not a function: tsx/esbuild rewrites named inner
  // functions to reference a __name helper that does not exist in the page.
  await page.evaluate(`
    (() => {
      function hide() {
        for (const el of document.querySelectorAll('img,iframe')) {
          const r = el.getBoundingClientRect();
          if (r.width > 300 && r.height > 40 && r.top > 200) {
            (el.closest('a') || el).style.display = 'none';
          }
        }
      }
      hide();
      new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });
      setInterval(hide, 400);
    })()
  `);
  await sleep(6000); // let the slot try to load, and get hidden
  evidence.adsHidden = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>("img")].filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 300 && r.height > 40;
      }).length === 0,
  );

  evidence.explorerTitle = await page.title();
  evidence.explorerBody = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400);
  console.log(`  explorer: ${evidence.explorerTitle}`);

  await glide(page, 1200, 600, 1400);
  await sleep((HOLD_S + PAD_S) * 1000);
  const endMs = now();

  await context.close();
  await browser.close();

  const files = await readdir(OUT_DIR);
  const webm = files.find((f) => f.endsWith(".webm") && f !== "raw.webm" && f !== "basescan.webm");
  if (webm) await rename(join(OUT_DIR, webm), join(OUT_DIR, "basescan.webm"));

  await writeFile(
    join(OUT_DIR, "basescan-marks.json"),
    JSON.stringify(
      {
        source: "basescan.mp4",
        padSeconds: PAD_S,
        marks: [{ shot: "basescan", startMs, endMs, specHoldS: HOLD_S }],
        evidence,
      },
      null,
      2,
    ),
  );

  console.log(`\n  shot ${(startMs / 1000).toFixed(1)}s → ${(endMs / 1000).toFixed(1)}s`);
  console.log(`  video ${join(OUT_DIR, "basescan.webm")}\n`);
}

main().catch((err) => {
  console.error("\nRe-shoot failed:", err);
  process.exit(1);
});
