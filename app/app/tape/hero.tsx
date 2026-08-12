"use client";

import { VERDICT_COLOR, VERDICT_LABEL } from "./components";
import { rowVerdict, type TapeRow } from "./types";

/** Hero jitter sits at 8–12°, a harder angle than the ±2.5° of a tape row. */
function heroJitter(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `${(8 + (h % 400) / 100).toFixed(2)}deg`;
}

/** Faint real values in the hero gutters. Texture, never information. */
function HeroMarginalia({ rows }: { rows: TapeRow[] }) {
  const marks = rows
    .slice(0, 6)
    .map((row, i) => {
      const pool = [
        row.receipt?.blockNumber ? `#${row.receipt.blockNumber}` : null,
        row.receipt?.txHash ? row.receipt.txHash.slice(2, 12) : null,
        row.attempt.simulationGasEstimate ? `${row.attempt.simulationGasEstimate} gas` : null,
        row.attempt.idempotencyKey?.slice(0, 8) ?? null,
      ].filter((v): v is string => Boolean(v));
      const text = pool[i % pool.length];
      return text ? { text: text.slice(0, 10), i } : null;
    })
    .filter((m): m is { text: string; i: number } => m !== null);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {marks.map(({ text, i }) => (
        <span
          key={`${text}-${i}`}
          className="drift absolute font-mono text-[12px] tracking-wide whitespace-nowrap text-ink/[0.22]"
          style={{
            top: `${14 + i * 13}%`,
            [i % 2 === 0 ? "left" : "right"]: "2.5%",
            ["--drift" as string]: -(0.04 + (i % 3) * 0.03),
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

/**
 * The hero. 75vh, not 100 — the tape has to peek above the fold, because the
 * proof is the point and it cannot be buried. The stamp is the verdict of the
 * most recent intent, read live off the ledger; when a new verdict lands it
 * re-slams.
 */
export function Hero({ rows }: { rows: TapeRow[] }) {
  const newest = rows[0];
  const verdict = newest ? rowVerdict(newest) : null;

  return (
    // Layered depth into the tape: lag, soften, fade — all driven from the
    // --sy/--hp custom properties in CSS, so scrolling never re-renders React.
    <section
      data-hero
      aria-label="Reckon"
      className="hero-parallax relative z-10 flex h-[55vh] flex-col items-center justify-center overflow-hidden px-4 md:h-[75vh]"
    >
      <HeroMarginalia rows={rows} />

      <div className="relative w-full max-w-[1180px]">
        <h1 className="mast-title text-center font-display uppercase leading-[0.82] text-green [font-size:clamp(3.25rem,19vw,22rem)]">
          Reckon
        </h1>

        {/* The live verdict, stamped across the letterforms. */}
        {verdict ? (
          <span
            key={`${newest.attempt.id}-${verdict}`}
            // bg-bg: a stamp occludes what it lands on. Without it the green
            // verdict disappears into the green letterforms underneath.
            className={`stamp-3d absolute left-1/2 top-1/2 inline-block w-[28%] -translate-x-1/2 -translate-y-1/2 border-[3px] bg-bg px-2 py-3 text-center font-extrabold uppercase leading-none tracking-[0.08em] [font-size:clamp(0.62rem,1.55vw,1.35rem)] ${VERDICT_COLOR[verdict]}`}
            style={{ ["--stamp-rot" as string]: heroJitter(newest.attempt.id) }}
          >
            {VERDICT_LABEL[verdict]}
          </span>
        ) : null}
      </div>

      <p className="mt-6 text-center font-display text-[clamp(1rem,1.6vw,1.4rem)] italic text-ink/65">
        A settlement agent · KeeperHub Agents Onchain Hackathon
      </p>
    </section>
  );
}
