"use client";

import { ExplorerLink } from "./components";
import type { TapeRow } from "./types";

const NAV = [
  { label: "Tape", href: "#tape", active: true },
  { label: "Method", href: "#method", active: false },
  { label: "Ledger", href: "#ledger", active: false },
];

/**
 * The masthead: identity left, navigation and chain centre, the most recent
 * settled transaction right. Sits on the grid with its hairlines showing.
 */
export function SiteHeader({ latestSettled }: { latestSettled?: TapeRow }) {
  return (
    <header className="relative z-10 border-b border-rule">
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-2 items-center gap-6 px-4 py-4 md:grid-cols-[1fr_auto_1fr] md:px-8">
        {/* Left — identity */}
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[15px] font-bold leading-none">Reckon</span>
          <span className="font-display text-[13px] italic leading-none text-ink/65">
            Settlement Record · 2026
          </span>
        </div>

        {/* Centre — navigation + chain */}
        <nav className="order-3 col-span-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:order-none md:col-span-1">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`micro transition-colors duration-150 hover:text-ink ${
                item.active
                  ? "text-ink underline decoration-2 underline-offset-[6px]"
                  : "text-ink/65"
              }`}
            >
              {item.label}
            </a>
          ))}
          {/* Static indicator: Base Sepolia is the only chain in lib's registry. */}
          <span className="inline-flex items-center gap-1.5 rounded-[5rem] border border-green px-3.5 py-1 font-display text-[15px] italic leading-none">
            Base Sepolia
            <span aria-hidden className="text-green">
              ˅
            </span>
          </span>
        </nav>

        {/* Right — the most recent settlement */}
        <div className="justify-self-end text-right">
          <p className="micro text-ink/65">Latest settled</p>
          {latestSettled?.receipt ? (
            <p className="mt-1">
              <ExplorerLink
                chainId={latestSettled.intent.chainId}
                txHash={latestSettled.receipt.txHash}
                className="font-mono text-[15px] font-semibold underline decoration-2 underline-offset-[3px] transition-colors duration-150 hover:text-green"
              />
              <sup className="ml-1 font-mono text-[10px] text-ink/65">
                {latestSettled.receipt.blockNumber}
              </sup>
            </p>
          ) : (
            <p className="mt-1 font-mono text-[15px] text-ink/40">—</p>
          )}
        </div>
      </div>

      <p className="mx-auto max-w-[1180px] px-4 pb-5 text-center font-display text-[22px] italic leading-snug md:px-8">
        Nothing settles until the chain agrees
      </p>
    </header>
  );
}
