// ── WYRM.LAB · run control plane (SERVER ONLY) ──────────────────────
// Every live LLM run registers a control handle here. The operator
// dashboard can PAUSE the loop between turns, inject STEERING notes
// that enter the model's very next prompt, or INTERRUPT the in-flight
// HTTP call via AbortController. All activity is broadcast as events
// to every SSE subscriber (the control room UI).

import type { GameEvent } from "./types";

export type LiveEvent =
  | { type: "hello"; runId: string; status: string; thinking: string; turns: number; steers: number }
  | { type: "status"; status: string; note?: string }
  | { type: "llm-delta"; text?: string; thinking?: string }
  | { type: "llm-done"; latencyMs: number; provider: string; model: string }
  | { type: "steer-applied"; text: string }
  | { type: "steer-queued"; text: string }
  | { type: "paused" }
  | { type: "resumed" }
  | {
      type: "step";
      turn: number;
      attempt: number;
      action: string;
      valid: boolean;
      reason?: string;
      thought?: string;
      stateJson: string;
      events: GameEvent[];
      latencyMs: number;
    }
  | { type: "run-end"; status: string };

export interface RunCtl {
  runId: string;
  paused: boolean;
  pauseCount: number;
  abort: AbortController;
  steers: string[];
  steerLog: { at: number; text: string }[];
  listeners: Set<(e: LiveEvent) => void>;
  snapshot: { status: string; thinking: string; turns: number };
  pausedWaiters: (() => void)[];
}

const registry = new Map<string, RunCtl>();

export function createCtl(runId: string): RunCtl {
  destroyCtl(runId);
  const ctl: RunCtl = {
    runId,
    paused: false,
    pauseCount: 0,
    abort: new AbortController(),
    steers: [],
    steerLog: [],
    listeners: new Set(),
    snapshot: { status: "running", thinking: "", turns: 0 },
    pausedWaiters: [],
  };
  registry.set(runId, ctl);
  return ctl;
}

export function getCtl(runId: string): RunCtl | undefined {
  return registry.get(runId);
}

export function destroyCtl(runId: string): void {
  const ctl = registry.get(runId);
  if (ctl) {
    ctl.pausedWaiters.forEach((w) => w());
    registry.delete(runId);
  }
}

export function emit(ctl: RunCtl, ev: LiveEvent): void {
  if (ev.type === "llm-delta") {
    if (ev.thinking) ctl.snapshot.thinking += ev.thinking;
  } else if (ev.type === "step") {
    ctl.snapshot.turns = Math.max(ctl.snapshot.turns, ev.turn);
  } else if (ev.type === "status" || ev.type === "run-end") {
    ctl.snapshot.status = ev.status;
  }
  for (const fn of ctl.listeners) {
    try {
      fn(ev);
    } catch {
      /* a dead subscriber must never kill the run */
    }
  }
}

export function subscribe(runId: string, fn: (e: LiveEvent) => void): () => void {
  const ctl = registry.get(runId);
  if (!ctl) return () => undefined;
  ctl.listeners.add(fn);
  return () => ctl.listeners.delete(fn);
}

/**
 * The pause gate. Called before every LLM turn: blocks while the run
 * is paused, then drains and returns any queued steering notes.
 */
export async function gate(ctl: RunCtl): Promise<string[]> {
  while (ctl.paused && !ctl.abort.signal.aborted) {
    await new Promise<void>((resolve) => ctl.pausedWaiters.push(resolve));
  }
  const drained = ctl.steers;
  ctl.steers = [];
  return drained;
}

export type ControlOp = "pause" | "resume" | "steer" | "interrupt";

export function control(runId: string, op: ControlOp, text?: string): { ok: boolean; message: string } {
  const ctl = registry.get(runId);
  if (!ctl) return { ok: false, message: "run is not active (already finished or never started)" };

  switch (op) {
    case "pause": {
      if (ctl.paused) return { ok: true, message: "already paused" };
      ctl.paused = true;
      ctl.pauseCount++;
      emit(ctl, { type: "paused" });
      emit(ctl, { type: "status", status: "paused", note: "operator paused the loop" });
      return { ok: true, message: "paused — the run halts before its next LLM turn" };
    }
    case "resume": {
      if (!ctl.paused) return { ok: true, message: "already running" };
      ctl.paused = false;
      ctl.pausedWaiters.forEach((w) => w());
      ctl.pausedWaiters = [];
      emit(ctl, { type: "resumed" });
      emit(ctl, { type: "status", status: "running", note: "operator resumed" });
      return { ok: true, message: "resumed" };
    }
    case "steer": {
      const note = (text ?? "").trim();
      if (!note) return { ok: false, message: "empty steering note" };
      ctl.steers.push(note);
      ctl.steerLog.push({ at: Date.now(), text: note });
      emit(ctl, { type: "steer-queued", text: note });
      return { ok: true, message: "steering note queued — it enters the model's next prompt verbatim" };
    }
    case "interrupt": {
      ctl.abort.abort(new Error("INTERRUPTED by operator"));
      emit(ctl, { type: "status", status: "interrupting", note: "operator interrupted the in-flight call" });
      return { ok: true, message: "interrupt signal sent" };
    }
  }
}
