"use client";

import { useEffect, useState } from "react";
import type { TapeRow } from "./types";

const CELL = 132;

/**
 * The recalculating grid. Offsets are centred — (innerWidth % cell)/2 — and
 * recomputed on resize, so the paper always has a whole cell at each edge
 * rather than a clipped one. Fixed and behind everything; the ledger sits on
 * it. Row height is an exact half-cell, so the rules keep the grid's rhythm.
 */
export function RecalcGrid() {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const compute = () =>
      setOffset({ x: (window.innerWidth % CELL) / 2, y: (window.innerHeight % CELL) / 2 });
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  if (!offset) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          `repeating-linear-gradient(to right, var(--hairline) 0 1px, transparent 1px ${CELL}px),` +
          `repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px ${CELL}px)`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      }}
    />
  );
}

/**
 * One rAF loop for every scroll-driven effect on the page. It writes three
 * custom properties on <html>; CSS does the rest. Previously the hero, the
 * rail and each marginalia mark each held scroll state in React and
 * re-rendered on every frame — that was the jank.
 */
export function ScrollDriver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    let frame = 0;
    let last = -1;

    const write = () => {
      frame = 0;
      const y = window.scrollY;
      if (y === last) return;
      last = y;

      const max = root.scrollHeight - window.innerHeight;
      const hero = document.querySelector<HTMLElement>("[data-hero]");
      const heroH = hero?.offsetHeight ?? 1;

      const hp = Math.min(1, y / heroH);
      root.style.setProperty("--sy", `${y}px`);
      root.style.setProperty("--sp", String(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0));
      root.style.setProperty("--hp", String(hp));
      // Blur is the one property here that forces a re-rasterize, and a
      // full-viewport hero is expensive to repaint. Quantising to 1px steps
      // cuts that from every frame to five times over the whole hero; the
      // simultaneous opacity fade hides the stepping.
      root.style.setProperty("--hb", `${Math.round(hp * 4)}px`);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

/** A ledger margin rule: how far down the tape you are. No cardinal labels. */
export function ScrollRail() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-5 top-[12vh] bottom-[12vh] z-10 hidden w-px bg-ink/10 lg:block"
    >
      <div className="rail-fill h-full w-px bg-ink/45" />
    </div>
  );
}

interface Mark {
  text: string;
  top: number;
  side: "left" | "right";
  drift: number;
}

/**
 * Ambient marginalia: real values off the ledger — block heights, truncated
 * hashes, gas, idempotency-key fragments — drifting in the gutters. Texture,
 * not information: it lives outside the content column, is hidden below xl
 * where there is no gutter to spare, and sits at an opacity nobody is asked
 * to read.
 */
export function Marginalia({ rows }: { rows: TapeRow[] }) {
  const marks: Mark[] = [];
  rows.slice(0, 10).forEach((row, i) => {
    const pool = [
      row.receipt?.blockNumber ? `#${row.receipt.blockNumber}` : null,
      row.receipt?.txHash ? row.receipt.txHash.slice(2, 12) : null,
      row.attempt.simulationGasEstimate ? `${row.attempt.simulationGasEstimate} gas` : null,
      row.attempt.idempotencyKey ? row.attempt.idempotencyKey.slice(0, 8) : null,
      row.attempt.executionId,
    ].filter((v): v is string => Boolean(v));
    const text = pool[i % pool.length];
    if (!text) return;
    marks.push({
      // Capped so a long execution id can never reach into the content column.
      text: text.length > 10 ? text.slice(0, 10) : text,
      top: 240 + i * 190,
      side: i % 2 === 0 ? "left" : "right",
      drift: 0.05 + (i % 3) * 0.035,
    });
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden xl:block">
      {marks.map((m, i) => (
        <span
          key={`${m.text}-${i}`}
          className="drift absolute font-mono text-[12px] tracking-wide whitespace-nowrap text-ink/[0.22]"
          style={{ top: m.top, [m.side]: "-104px", ["--drift" as string]: -m.drift }}
        >
          {m.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Lenis smooth scroll, expo-out. Disabled outright under reduced motion —
 * hijacking the scroll is itself motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | undefined;
    let cancelled = false;

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({
        // Slightly shorter than the default feel: 1.1s reads as lag on a
        // dense ledger page. Expo-out keeps the settle.
        duration: 0.9,
        easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
        // Native momentum on touch beats a JS-driven approximation.
        syncTouch: false,
      });
      const tick = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);

  return null;
}
