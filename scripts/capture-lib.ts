/**
 * Shared capture rig for the demo video scripts.
 *
 * Playwright records the page via CDP screencast — never the desktop — so the
 * pointer is not in the frame. Everything here exists to make a scripted run
 * read like someone using the site: a drawn cursor, eased pointer motion, and
 * wheel-driven scrolling that lets the page's own Lenis smoothing do the work.
 */
import type { Page } from "playwright";

export const VIEWPORT = { width: 1920, height: 1080 };

/**
 * A real Chrome UA. Playwright's headless UA contains "HeadlessChrome", which
 * Cloudflare-fronted explorers challenge — that cost the first take its
 * BaseScan shot.
 */
export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--font-render-hinting=none",
];

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * A visible cursor. Without it every click reads as the page changing on its
 * own, and the whole thing looks like a screen capture of nothing.
 */
export const CURSOR_SCRIPT = `
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
          transition: width .1s, height .1s, background .1s;
        }
        #__cursor::after {
          content: ''; position: absolute; left: 50%; top: 50%;
          width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%;
          background: rgba(20,20,20,.95);
        }
        #__cursor.__down { background: rgba(20,20,20,.34); width: 20px; height: 20px; }
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

/** Move the pointer in small steps so the motion is legible on video. */
export async function glide(page: Page, x: number, y: number, ms = 900): Promise<void> {
  await page.mouse.move(x, y, { steps: Math.max(12, Math.round(ms / 16)) });
  await sleep(180);
}

/**
 * Wheel-driven scroll. The page runs Lenis, so real wheel deltas produce the
 * site's own eased motion — a scripted scrollTo would bypass it and look wrong.
 */
export async function wheelTo(page: Page, targetY: number, durationMs = 2500): Promise<void> {
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

/** Absolute document Y that puts `sel` at `fromTop` px down the viewport. */
export async function yFor(page: Page, sel: string, fromTop = 220): Promise<number> {
  return page.evaluate(
    ([s, off]) => {
      const el = document.querySelector(s as string);
      if (!el) throw new Error(`no element for ${s}`);
      return Math.max(0, window.scrollY + el.getBoundingClientRect().top - (off as number));
    },
    [sel, fromTop] as const,
  );
}

/** Centre of an element, in viewport coords — where the pointer should land. */
export async function centreOf(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error(`no box for ${sel}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Read the counters as rendered, so narration can be checked against them. */
export async function readCounters(page: Page): Promise<Record<string, string>> {
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
