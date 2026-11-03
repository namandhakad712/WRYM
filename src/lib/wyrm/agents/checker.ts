// ── WYRM.LAB · The Checker (deterministic certification) ────────────
// No LLM. Replays a recorded run's actions on a fresh engine instance
// and verifies every claim: action validity, event log fidelity, and
// the final result. Signs the run CERTIFIED or INVALID.
// Handles multi-attempt runs (death ⇒ reset ⇒ next attempt).

import { Action, LevelDef } from "../types";
import { createGame, step, serializeState } from "../engine";

export interface CheckInput {
  steps: { action: string; valid: boolean; attempt: number; stateJson: string; events: string }[];
  claimedStatus: string;
}

export interface CheckerVerdict {
  verdict: "CERTIFIED" | "INVALID";
  reasons: string[];
  replayedMoves: number;
  finalStatus: string;
}

export function checkRun(level: LevelDef, input: CheckInput): CheckerVerdict {
  const reasons: string[] = [];
  let state = createGame(level);
  let currentAttempt = 1;
  let replayed = 0;

  for (let i = 0; i < input.steps.length; i++) {
    const rec = input.steps[i];

    // attempt boundary: the agent died / reset — restart the level
    if (rec.attempt > currentAttempt) {
      currentAttempt = rec.attempt;
      state = createGame(level);
    }

    const r = step(state, rec.action as Action);

    if (rec.valid) {
      if (!r.valid) {
        reasons.push(
          `step ${i + 1} (attempt ${rec.attempt}): run claims "${rec.action}" was legal but the engine rejects it (${r.reason})`,
        );
        return { verdict: "INVALID", reasons, replayedMoves: replayed, finalStatus: state.status };
      }
      state = r.state;
      replayed++;

      // event fidelity: the run's recorded events must match the engine's
      const recorded = safeJson(rec.events) as any[];
      const shape = (e: any) => `${e.type}`;
      const recordedShape = (Array.isArray(recorded) ? recorded : []).map(shape).sort().join(",");
      const engineShape = r.events.map(shape).sort().join(",");
      if (recordedShape !== engineShape) {
        reasons.push(
          `step ${i + 1} (attempt ${rec.attempt}): event mismatch (recorded [${recordedShape}] vs engine [${engineShape}])`,
        );
      }

      // state fidelity: serialized dynamic state must match the recording
      const replayedJson = normalizeState(serializeState(state));
      const recordedJson = normalizeState(rec.stateJson);
      if (replayedJson !== recordedJson) {
        reasons.push(
          `step ${i + 1} (attempt ${rec.attempt}): recorded board diverges from deterministic replay`,
        );
      }
    } else {
      // claimed invalid: engine must agree it was invalid
      if (r.valid) {
        reasons.push(
          `step ${i + 1} (attempt ${rec.attempt}): run marks "${rec.action}" invalid but the engine accepts it`,
        );
      }
    }
  }

  // "aborted" is a thinker-level outcome (LLM unavailable / stuck) —
  // the action log itself can still be perfectly integral, so the
  // final-status comparison only applies to engine-level outcomes.
  const engineLevelClaim = input.claimedStatus !== "aborted";
  if (engineLevelClaim && state.status !== input.claimedStatus) {
    reasons.push(
      `final status mismatch: replay ends "${state.status}" but run claims "${input.claimedStatus}"`,
    );
  }

  return {
    verdict: reasons.length === 0 ? "CERTIFIED" : "INVALID",
    reasons,
    replayedMoves: replayed,
    finalStatus: state.status,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/** Normalize a serialized state for comparison (drop volatile fields). */
function normalizeState(json: string): string {
  try {
    const d = JSON.parse(json);
    const sortKey = (p: any) => `${p.x},${p.y}`;
    return JSON.stringify({
      t: d.t,
      c: [...(d.c ?? [])].map(sortKey).sort(),
      a: [...(d.a ?? [])].map(sortKey).sort(),
      r: [...(d.r ?? [])].map(sortKey).sort(),
      m: d.m,
      n: d.n,
      s: d.s,
    });
  } catch {
    return json;
  }
}
