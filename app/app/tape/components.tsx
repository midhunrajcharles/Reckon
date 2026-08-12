import type { TapeRow, Verdict } from "./types";
import { explorerTxUrl, rowVerdict, shortHash } from "./types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  settled: "SETTLED",
  blocked: "RETRY BLOCKED",
  reverted: "REVERTED",
  unverified: "UNVERIFIED",
  no_broadcast: "NO BROADCAST",
  needs_review: "NEEDS MANUAL REVIEW",
  pending: "VERIFYING",
};

// Semantic only. Anything that isn't settled or blocked is ink.
export const VERDICT_COLOR: Record<Verdict, string> = {
  settled: "text-green border-green",
  blocked: "text-blocked border-blocked",
  reverted: "text-blocked border-blocked",
  unverified: "text-ink/70 border-ink/40",
  no_broadcast: "text-ink/70 border-ink/40",
  needs_review: "text-ink/70 border-ink/40",
  pending: "text-ink/40 border-ink/25",
};

/** Deterministic per-row jitter — the same row always sits at the same angle. */
export function jitter(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `${((h % 500) / 100 - 2.5).toFixed(2)}deg`;
}

export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2 border-t border-ink pt-3">
      <span className="micro">{label}</span>
      <span className="font-display text-[clamp(3.5rem,9vw,7.5rem)] font-normal leading-[0.85] tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Mobile-only: on md+ the column header row already names the cells. */
function CellLabel({ children }: { children: React.ReactNode }) {
  return <span className="micro mb-1 block text-ink/50 md:hidden">{children}</span>;
}

/** Unregistered chains render as plain text — never an anchor without an href. */
export function ExplorerLink({
  chainId,
  txHash,
  className = "font-mono text-[13px] underline decoration-ink/30 underline-offset-[3px] transition-colors duration-150 hover:decoration-ink",
}: {
  chainId: number;
  txHash: string;
  className?: string;
}) {
  const href = explorerTxUrl(chainId, txHash);
  const short = shortHash(txHash);
  if (!href) return <span className="whitespace-nowrap font-mono text-[13px] text-ink/60">{short}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`whitespace-nowrap ${className}`}>
      {short}
    </a>
  );
}

function VerdictStamp({ verdict, seed }: { verdict: Verdict; seed: string }) {
  return (
    <span
      className={`stamp inline-block whitespace-nowrap border-2 px-2 py-1 text-[13px] font-extrabold uppercase leading-none tracking-[0.1em] ${VERDICT_COLOR[verdict]}`}
      style={{ ["--stamp-rot" as string]: jitter(seed) }}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * One attempt on the tape. Row height is an exact half grid-cell, so the
 * rules keep the paper's rhythm. Rows are ruled paper, never filled cards —
 * a fill would fight the hairlines.
 */
export function TapeRowView({ row, isNew = false }: { row: TapeRow; isNew?: boolean }) {
  const verdict = rowVerdict(row);
  const torn = row.discrepancy !== null;

  return (
    <li
      className={`grid grid-cols-2 gap-x-6 gap-y-4 border-b border-rule px-4 py-4 md:grid-cols-[1.1fr_0.8fr_0.9fr_1fr_1.1fr_minmax(168px,auto)] md:items-center md:py-0 ${
        // A discrepancy row carries its verdict caption, so it takes a full
        // cell where a clean row takes a half. Both stay on the grid.
        torn ? "border-l-2 border-l-blocked md:h-[var(--cell)]" : "border-l-2 border-l-transparent md:h-[var(--row)]"
      } ${isNew ? "tape-row" : ""}`}
    >
      {/* Intent */}
      <div className="col-span-2 md:col-span-1">
        <CellLabel>intent</CellLabel>
        <p className="truncate font-mono text-[13px]">{row.intent.taskId}</p>
        {/* Raw amount, no unit — the API's unit convention is unconfirmed beyond zero. */}
        <p className="truncate font-mono text-[13px] text-ink/70">
          amount {row.intent.amount} → {shortHash(row.intent.recipientAddress)}
        </p>
      </div>

      {/* Simulation */}
      <div>
        <CellLabel>simulation</CellLabel>
        <p className="font-mono text-[13px]">
          {row.attempt.simulationWouldRevert === null ? (
            <span className="text-ink/40">—</span>
          ) : row.attempt.simulationWouldRevert ? (
            <span className="text-blocked">would revert</span>
          ) : (
            <span className="whitespace-nowrap">clean · {row.attempt.simulationGasEstimate ?? "?"}</span>
          )}
        </p>
      </div>

      {/* Attempt */}
      <div>
        <CellLabel>attempt</CellLabel>
        <p className="font-mono text-[13px]">
          #{row.attempt.retryNumber}
          {row.attempt.idempotentReplay ? " · replay" : ""}
        </p>
        <p className="truncate font-mono text-[13px] text-ink/70" title={row.attempt.trigger}>
          {row.attempt.trigger}
        </p>
      </div>

      {/* Reported — the platform's claim */}
      <div>
        <CellLabel>reported</CellLabel>
        <p className={`font-mono text-[13px] ${torn ? "text-ink/70 line-through decoration-blocked" : ""}`}>
          {row.attempt.reportedStatus ?? "—"}
        </p>
        {row.attempt.executionId ? (
          <p className="truncate font-mono text-[13px] text-ink/70" title={row.attempt.executionId}>
            {row.attempt.executionId}
          </p>
        ) : null}
      </div>

      {/* Chain truth — the independent read; the seam lives on this cell */}
      <div className={`pl-4 ${torn ? "border-l-2 border-blocked" : "border-l border-rule"}`}>
        <CellLabel>chain truth</CellLabel>
        {row.receipt ? (
          <>
            <p
              className={`whitespace-nowrap font-mono text-[13px] ${
                row.receipt.status === "success" ? "text-green" : "text-blocked"
              }`}
            >
              {row.receipt.status} · {row.receipt.blockNumber}
            </p>
            <ExplorerLink chainId={row.intent.chainId} txHash={row.receipt.txHash} />
          </>
        ) : row.attempt.reportedTxHash ? (
          <p className="font-mono text-[13px]">
            {row.attempt.verifiedStatus === "timeout" ? "rpc timeout — failing closed" : "no trace — failing closed"}
          </p>
        ) : (
          <p className="font-mono text-[13px] text-ink/70">nothing sent — no hash</p>
        )}
      </div>

      {/* Verdict */}
      <div className="md:justify-self-end">
        <VerdictStamp verdict={verdict} seed={row.attempt.id} />
        {torn ? (
          <p className="sentence mt-2 text-[15px] leading-[1.3] md:text-right">
            <em>One transaction,</em> <span className="aside">not two.</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}
