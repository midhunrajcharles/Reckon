"use client";

import { useEffect, useRef, useState } from "react";
import { ChaosPanel } from "./tape/chaos-panel";
import { Marginalia, RecalcGrid, ScrollDriver, ScrollRail, SmoothScroll } from "./tape/chrome";
import { StatTile, TapeRowView } from "./tape/components";
import { SiteHeader } from "./tape/header";
import { Hero } from "./tape/hero";
import { rowVerdict, type TapeSnapshot } from "./tape/types";

const POLL_MS = 3000;

export default function TapePage() {
  const [snapshot, setSnapshot] = useState<TapeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  // First paint only — the reveal must not re-run when the 3s poll lands.
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch("/api/tape", { cache: "no-store" });
        const body = await res.json();
        if (!alive.current) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setSnapshot(body);
        setError(null);
      } catch (err) {
        if (alive.current) setError((err as Error).message);
      }
      if (alive.current) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, []);

  const latestSettled = snapshot?.rows.find((r) => rowVerdict(r) === "settled" && r.receipt);

  return (
    <>
      <SmoothScroll />
      <ScrollDriver />
      <RecalcGrid />
      <ScrollRail />
      <SiteHeader latestSettled={latestSettled} />
      <Hero rows={snapshot?.rows ?? []} />

      <main className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-4 pb-16 md:px-8">
        <Marginalia rows={snapshot?.rows ?? []} />

        <p className="sentence first-paint max-w-[62ch]">
          Every attempt shows what the platform <em>reported</em> and what the chain actually holds.{" "}
          <span className="aside">
            {error ? `Ledger unreachable — ${error}.` : "Nothing settles until an independent read says so."}
          </span>
        </p>

        <section
          id="ledger"
          aria-label="Counters"
          className="first-paint mt-14 grid grid-cols-1 gap-x-10 gap-y-10 scroll-mt-8 sm:grid-cols-3"
        >
          <StatTile label="Settled onchain" value={snapshot?.counters.settled ?? 0} />
          <StatTile label="Attempts reconciled" value={snapshot?.counters.reconciled ?? 0} />
          <StatTile label="Discrepancies caught" value={snapshot?.counters.discrepanciesCaught ?? 0} />
        </section>

        <div id="method" className="first-paint mt-16 scroll-mt-8">
          <ChaosPanel />
        </div>

        <section id="tape" aria-label="Settlement tape" className="mt-16 scroll-mt-8">
          <div className="hidden border-b-2 border-ink px-4 pb-2 md:grid md:grid-cols-[1.1fr_0.8fr_0.9fr_1fr_1.1fr_minmax(168px,auto)] md:gap-x-6">
            <span className="micro">Intent</span>
            <span className="micro">Simulation</span>
            <span className="micro">Attempt</span>
            <span className="micro">Reported</span>
            <span className="micro pl-4">Chain truth</span>
            <span className="micro justify-self-end">Verdict</span>
          </div>
          {snapshot === null ? (
            error ? (
              <p className="sentence px-4 py-10">
                Ledger read failed. <span className="aside">{error}. Retrying every {POLL_MS / 1000}s.</span>
              </p>
            ) : (
              <p className="sentence px-4 py-10">
                <span className="aside">Reading the ledger…</span>
              </p>
            )
          ) : snapshot.rows.length === 0 ? (
            <p className="sentence px-4 py-10">
              The tape is empty. <span className="aside">Attempts appear the moment the executor swings.</span>
            </p>
          ) : (
            <ul>
              {snapshot.rows.map((row) => {
                const isNew = !seen.current.has(row.attempt.id);
                seen.current.add(row.attempt.id);
                return <TapeRowView key={row.attempt.id} row={row} isNew={isNew} />;
              })}
            </ul>
          )}
        </section>

        <footer className="sentence mt-20 max-w-[70ch] border-t border-ink pt-4">
          Reported status is a <em>hypothesis</em>.{" "}
          <span className="aside">
            Chain truth is fetched with viem against an RPC KeeperHub does not operate.
          </span>{" "}
          Mismatches block the retry — <em>that is the product</em>.
        </footer>
      </main>
    </>
  );
}
