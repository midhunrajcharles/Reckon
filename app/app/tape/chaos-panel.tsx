"use client";

import { useState } from "react";

type Scenario = "reported-failure" | "gas-spike";
type RunState = { running: Scenario | null; result: string | null; error: string | null };

/**
 * The demo controls. Each scenario runs a REAL settlement through the full
 * pipeline; the injected condition is labelled on the tape row's trigger.
 * Framing: this demonstrates the agent's defence — the injections simulate
 * conditions any execution platform can exhibit.
 */
export function ChaosPanel() {
  const [state, setState] = useState<RunState>({ running: null, result: null, error: null });

  async function run(scenario: Scenario) {
    setState({ running: scenario, result: null, error: null });
    try {
      const res = await fetch(`/api/chaos/${scenario}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({
        running: null,
        error: null,
        result:
          scenario === "reported-failure"
            ? `Settlement ${body.taskId} mined onchain; told "failed" anyway. Reckon read the chain, blocked the intent, and refused the retry — one transaction, not two.`
            : `Bid refused by the injected spike; Reckon escalated to 1.5× and settled ${body.taskId} for real.`,
      });
    } catch (err) {
      setState({ running: null, result: null, error: (err as Error).message });
    }
  }

  const busy = state.running !== null;

  return (
    <section aria-label="Live demo" className="border-t border-ink pt-4">
      <h2 className="micro">Prove the defence — live</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <button
          onClick={() => run("reported-failure")}
          disabled={busy}
          className="group cursor-pointer border-2 border-blocked px-4 py-4 text-left transition-colors duration-150 hover:bg-blocked hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blocked disabled:cursor-wait disabled:opacity-45"
        >
          <span className="micro block text-blocked group-hover:text-bg">
            {state.running === "reported-failure" ? "Injecting… (~30s)" : "Inject reported failure"}
          </span>
          <span className="sentence mt-2 block text-[17px]">
            The settlement lands onchain, but the agent is <em>told it failed</em>.{" "}
            <span className="aside group-hover:text-bg/80">
              Reckon reads the chain itself and refuses the retry that would pay twice.
            </span>
          </span>
        </button>

        <button
          onClick={() => run("gas-spike")}
          disabled={busy}
          className="group cursor-pointer border-2 border-ink px-4 py-4 text-left transition-colors duration-150 hover:bg-ink hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-45"
        >
          <span className="micro block group-hover:text-bg">
            {state.running === "gas-spike" ? "Injecting… (~30s)" : "Inject gas spike"}
          </span>
          <span className="sentence mt-2 block text-[17px]">
            The first gas bid <em>dies to an injected spike</em>.{" "}
            <span className="aside group-hover:text-bg/80">
              Reckon escalates the bid, re-attempts, and settles for real.
            </span>
          </span>
        </button>
      </div>

      {state.result ? (
        <p className="sentence mt-4 border-l-2 border-green pl-4 text-[17px]" role="status">
          {state.result}
        </p>
      ) : null}
      {state.error ? (
        <p className="sentence mt-4 border-l-2 border-blocked pl-4 text-[17px] text-blocked" role="alert">
          Scenario failed. <span className="aside">{state.error}</span>
        </p>
      ) : null}
    </section>
  );
}
