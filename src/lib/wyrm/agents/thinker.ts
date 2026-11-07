// ── WYRM.LAB · The Thinker (solving agent) ───────────────────────────
// Plays a level turn by turn. Two brains:
//  · "glm-4.6"  — real LLM: reads the ASCII observation, reasons,
//                 answers {"thought", "action"} — every thought is kept.
//  · "wyrm-bfs" — baseline exhaustive solver (optimal, no LLM).
// Every step (valid or rejected) is emitted through onStep so the
// dashboard can replay the run exactly as it happened.

import {
  Action,
  GameEvent,
  LevelDef,
} from "../types";
import { createGame, serializeState, deserializeState, step, MAX_TURNS, DEFAULT_TURN_LIMIT } from "../engine";
import { renderAscii, thinkerSystemPrompt } from "../ascii";
import { validateLevel } from "../validator";
import { chat } from "./llm";
import { llmChat } from "../llm/client";
import { projectObservation, parseActionReply, auditRecord, SandboxAudit } from "../sandbox";
import type { RunCtl } from "../runcontrol";
import { emit, gate } from "../runcontrol";
import type { ChatMsg } from "../llm/types";
import type { LLMTarget } from "../llm/types";

export interface StepRecord {
  turn: number;
  attempt: number;
  action: string;
  valid: boolean;
  reason?: string;
  thought?: string;
  rawOutput?: string;
  obsText: string;
  stateAscii: string;
  stateJson: string;
  events: GameEvent[];
  latencyMs: number;
  sandboxJson?: string; // isolation audit for this model call
}

export interface ThinkerResult {
  status: "won" | "lost" | "dead" | "exhausted" | "aborted" | "interrupted";
  attempts: number;
  deaths: number;
  movesUsed: number;
  applesEaten: number;
  splitsUsed: number;
  steps: StepRecord[];
  llmError?: string;
  steered?: number;
  pausedCount?: number;
}

export interface ThinkerCheckpoint {
  stateJson: string;
  convo: ChatMsg[];
  history: { action: Action; valid: boolean; note?: string }[];
  steps: StepRecord[];
  deaths: number;
  movesUsed: number; // totalValidMoves so far
  attempt: number;
  consecutiveInvalid: number;
  lastInvalidReason?: string;
}

export interface ThinkerOpts {
  maxSteps?: number;
  maxAttempts?: number;
  maxConsecutiveInvalid?: number;
  coachHints?: string[]; // agentic memory from previous reviews
  ctl?: RunCtl; // operator control plane (pause / steer / interrupt)
  onStep?: (rec: StepRecord, attempt: number) => void | Promise<void>;
  /** Headless mode: explicit provider chain (primary + fallbacks).
   *  When set, the DB role resolution is bypassed and every call goes
   *  through the same reliability pipeline (retries, limiter, circuit,
   *  context fitting) via llmChat directly. */
  llmChain?: LLMTarget[];
  /** Resume a previously checkpointed run mid-attempt (the harness may
   *  be sliced across process lifetimes — e.g. CI time windows). The
   *  restored run produces ONE artifact indistinguishable from an
   *  unbroken one: same steps, same statuses, same replay. */
  resume?: ThinkerCheckpoint;
  /** Called after every recorded step with the full resumable context.
   *  Write it wherever your harness needs to survive a kill -9. */
  onCheckpoint?: (ck: ThinkerCheckpoint) => void;
}

// (action validity is enforced by the sandbox schema — see lib/wyrm/sandbox.ts)

export async function runThinker(
  level: LevelDef,
  modelKey: string,
  opts: ThinkerOpts = {},
): Promise<ThinkerResult> {
  return modelKey === "wyrm-bfs" ? runBfsThinker(level, opts) : runLlmThinker(level, modelKey, opts);
}

// ── baseline solver ──────────────────────────────────────────────────
async function runBfsThinker(level: LevelDef, opts: ThinkerOpts): Promise<ThinkerResult> {
  const report = validateLevel(level);
  if (!report.solvable) {
    return {
      status: "aborted",
      attempts: 0,
      deaths: 0,
      movesUsed: 0,
      applesEaten: 0,
      splitsUsed: 0,
      steps: [],
      llmError: "level unsolvable",
    };
  }
  let state = createGame(level);
  const steps: StepRecord[] = [];
  const solution = report.solution;

  for (let i = 0; i < solution.length; i++) {
    const action = solution[i];
    const obsText = projectObservation(state);
    const r = step(state, action);
    state = r.state;
    const rec: StepRecord = {
      turn: state.turn,
      attempt: 1,
      action,
      valid: true,
      thought: `[wyrm-bfs] exhaustive BFS solver — optimal move ${i + 1}/${solution.length} of ${report.minMoves}. States explored: ${report.statesExplored}. No heuristic: this is the provably shortest line.`,
      obsText,
      stateAscii: renderAscii(state),
      stateJson: serializeState(state),
      events: r.events,
      latencyMs: 0,
    };
    steps.push(rec);
    await opts.onStep?.(rec, 1);
  }

  return {
    status: "won",
    attempts: 1,
    deaths: 0,
    movesUsed: state.turn,
    applesEaten: countEaten(steps),
    splitsUsed: steps.filter((s) => s.action === "split").length,
    steps,
  };
}

function countEaten(steps: StepRecord[]): number {
  let n = 0;
  for (const s of steps) for (const e of s.events) if (e.type === "ate") n++;
  return n;
}

// ── LLM thinker ──────────────────────────────────────────────────────
async function runLlmThinker(
  level: LevelDef,
  modelKey: string,
  opts: ThinkerOpts,
): Promise<ThinkerResult> {
  const maxSteps = opts.maxSteps ?? Math.min(level.turnLimit ?? DEFAULT_TURN_LIMIT, MAX_TURNS);
  const maxAttempts = opts.maxAttempts ?? 3;
  const maxInvalid = opts.maxConsecutiveInvalid ?? 6;
  const ctl = opts.ctl;

  // ── resume: restore an interrupted attempt in full fidelity ──────
  const ck0 = opts.resume;

  const allSteps: StepRecord[] = ck0?.steps ?? [];
  let deaths = ck0?.deaths ?? 0;
  let llmError: string | undefined;
  let finalStatus: ThinkerResult["status"] = "lost";
  let attemptsUsed = ck0?.attempt ? ck0.attempt - 1 : 0;
  let totalValidMoves = ck0?.movesUsed ?? 0;
  let interrupted = false;

  for (
    let attempt = ck0?.attempt ?? 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    attemptsUsed = attempt;
    let state =
      ck0 && attempt === ck0.attempt
        ? deserializeState(ck0.stateJson)
        : createGame(level);
    const history: { action: Action; valid: boolean; note?: string }[] =
      ck0 && attempt === ck0.attempt ? ck0.history : [];
    const convo: ChatMsg[] =
      ck0 && attempt === ck0.attempt
        ? ck0.convo
        : [{ role: "system", content: thinkerSystemPrompt() }];
    let consecutiveInvalid =
      ck0 && attempt === ck0.attempt ? ck0.consecutiveInvalid : 0;
    let lastInvalidReason: string | undefined =
      ck0 && attempt === ck0.attempt ? ck0.lastInvalidReason : undefined;
    let attemptStatus: ThinkerResult["status"] | null = null;
    const checkpoint = () =>
      opts.onCheckpoint?.({
        stateJson: serializeState(state),
        convo,
        history,
        steps: allSteps,
        deaths,
        movesUsed: totalValidMoves,
        attempt,
        consecutiveInvalid,
        lastInvalidReason,
      });

    while (state.status === "playing" && state.turn < maxSteps) {
      // ── operator control plane ────────────────────────────────────
      // blocks here while paused; drains queued steering notes
      const steers = ctl ? await gate(ctl) : [];
      if (ctl?.abort.signal.aborted) {
        interrupted = true;
        attemptStatus = "interrupted";
        break;
      }

      const coachHint = attempt > 1 ? opts.coachHints?.[attempt - 2] : opts.coachHints?.[0];
      // L1 · observation firewall — the model sees ONLY this frozen text
      const obsText =
        projectObservation(state, {
          history,
          invalidReason: lastInvalidReason,
          coachHint,
        }) +
        (steers.length
          ? `\n\nOPERATOR STEERING (live human guidance — follow it unless it breaks a rule):\n${steers
              .map((s) => `  • ${s}`)
              .join("\n")}`
          : "");
      if (ctl && steers.length) {
        emit(ctl, { type: "steer-applied", text: steers.join(" | ") });
      }

      convo.push({ role: "user", content: obsText });
      // keep a generous rolling window; the LLM client's token-budget
      // fitter enforces the real per-provider context window
      // (truncation marker included), so big-context models keep more
      // history than small ones instead of a fixed 9-message cap.
      while (convo.length > 26) convo.splice(1, 2);

      const chatOpts = {
        role: "thinker" as const,
        signal: ctl?.abort.signal,
        onDelta: ctl
          ? (d: { text?: string; thinking?: string }) => {
              emit(ctl, { type: "llm-delta", ...d });
            }
          : undefined,
      };
      const res = opts.llmChain
        ? await llmChat(opts.llmChain[0], convo, {
            ...chatOpts,
            fallbacks: opts.llmChain.slice(1),
          })
        : await chat(convo, chatOpts);
      if (ctl) emit(ctl, { type: "llm-done", latencyMs: res.latencyMs, provider: res.provider, model: res.model });

      if (!res.ok) {
        llmError = res.error;
        if (ctl?.abort.signal.aborted || res.error?.includes("INTERRUPTED")) {
          interrupted = true;
          attemptStatus = "interrupted";
        } else {
          attemptStatus = "aborted";
        }
        break;
      }
      convo.push({ role: "assistant", content: res.text });

      // L2 · output quarantine — strict schema verdict, never trusted
      const verdict = parseActionReply(res.text);
      let action = verdict.action;
      let thought = verdict.thought || res.text.slice(0, 500);
      const streamedThinking = res.thinking?.trim();
      if (streamedThinking) thought = `${streamedThinking}\n—\n${thought}`;
      let parseNote: string | undefined;

      if (!verdict.ok) {
        parseNote = verdict.violations[0] ?? "reply rejected by sandbox";
      }

      // reliability audit — retries / fallbacks that carried this step
      // (always recorded: a clean single-attempt call is itself telemetry)
      const reliability = {
        degraded: res.degraded ?? false,
        attempts: res.attempts?.length ?? 1,
        rateWaitMs: res.rateWaitMs ?? 0,
        tokensIn: res.tokensIn ?? Math.ceil(Buffer.byteLength(obsText, "utf8") / 4),
        tokensOut: res.tokensOut ?? Math.ceil(Buffer.byteLength(res.text, "utf8") / 4),
        ...(res.attempts && (res.attempts.length > 1 || res.degraded)
          ? {
              trail: res.attempts.map((a) => `${a.provider}${a.skipped ? " (skipped: circuit)" : a.ok ? " ✓" : ` ✗ ${a.errorClass ?? "err"}`}`),
            }
          : {}),
      };

      const sandboxAudit: SandboxAudit = auditRecord({
        bytesIn: Buffer.byteLength(obsText, "utf8"),
        bytesOut: Buffer.byteLength(res.text, "utf8"),
        latencyMs: res.latencyMs,
        verdict: verdict.ok ? "CLEAN" : "VIOLATIONS",
        violations: verdict.violations,
        provider: res.provider,
        model: res.model,
        ...(reliability ? { reliability } : {}),
      });

      if (action === "") {
        // record the rejected response
        const rec: StepRecord = {
          turn: state.turn,
          attempt,
          action: res.text.slice(0, 40),
          valid: false,
          reason: parseNote,
          thought,
          rawOutput: res.text,
          obsText,
          stateAscii: renderAscii(state),
          stateJson: serializeState(state),
          events: [],
          latencyMs: res.latencyMs,
          sandboxJson: JSON.stringify(sandboxAudit),
        };
        allSteps.push(rec);
        await opts.onStep?.(rec, attempt);
        consecutiveInvalid++;
        lastInvalidReason = parseNote;
        checkpoint();
        if (consecutiveInvalid >= maxInvalid) {
          attemptStatus = "aborted";
          break;
        }
        continue;
      }

      const r = step(state, action as Action);
      const rec: StepRecord = {
        turn: r.valid ? r.state.turn : state.turn,
        attempt,
        action,
        valid: r.valid,
        reason: r.valid ? undefined : r.reason,
        thought,
        rawOutput: res.text,
        obsText,
        stateAscii: renderAscii(r.valid ? r.state : state),
        stateJson: serializeState(r.valid ? r.state : state),
        events: r.events,
        latencyMs: res.latencyMs,
        sandboxJson: JSON.stringify(sandboxAudit),
      };
      allSteps.push(rec);
      await opts.onStep?.(rec, attempt);
      if (ctl) {
        emit(ctl, {
          type: "step",
          turn: rec.turn,
          attempt,
          action: rec.action,
          valid: rec.valid,
          reason: rec.reason,
          thought: rec.thought?.slice(0, 2000),
          stateJson: rec.stateJson,
          events: r.events,
          latencyMs: rec.latencyMs,
        });
      }

      history.push({ action: action as Action, valid: r.valid, note: r.reason });

      if (r.valid) {
        consecutiveInvalid = 0;
        lastInvalidReason = undefined;
        state = r.state;
        totalValidMoves++;
        // checkpoint AFTER the state transition — a resumed process must
        // never re-ask a move that is already recorded in steps
        checkpoint();
        if (state.status === "won") { attemptStatus = "won"; break; }
        if (state.status === "dead") {
          deaths++;
          attemptStatus = "dead";
          break;
        }
        if (state.turn >= Math.min(maxSteps, MAX_TURNS)) { attemptStatus = "exhausted"; break; }
      } else {
        consecutiveInvalid++;
        lastInvalidReason = r.reason;
        checkpoint();
        if (consecutiveInvalid >= maxInvalid) { attemptStatus = "aborted"; break; }
      }
    }

    if (attemptStatus === null) attemptStatus = "exhausted";
    finalStatus = attemptStatus;

    if (attemptStatus === "won" || attemptStatus === "aborted" || attemptStatus === "interrupted") break;
    // retry with a fresh attempt (death/exhaustion) while attempts remain
  }

  return {
    status: finalStatus,
    attempts: attemptsUsed,
    deaths,
    movesUsed: totalValidMoves,
    applesEaten: countEaten(allSteps),
    splitsUsed: allSteps.filter((s) => s.valid && s.action === "split").length,
    steps: allSteps,
    llmError: interrupted ? undefined : llmError,
    steered: ctl?.steerLog.length ?? 0,
    pausedCount: ctl?.pauseCount ?? 0,
  };
}

function countValid(steps: StepRecord[]): number {
  return steps.filter((s) => s.valid).length;
}
