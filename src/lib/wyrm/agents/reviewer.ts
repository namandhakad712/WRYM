// ── WYRM.LAB · The Reviewer (LLM critique) ───────────────────────────
// Post-run analyst: reads the full trajectory digest and returns a
// structured verdict (rating, strengths, weaknesses, suggestions).
// Its suggestions feed the next Thinker run as coach hints — the
// "learning" channel of the sustained agentic loop.

import { LevelDef } from "../types";
import { renderAscii, reviewerSystemPrompt } from "../ascii";
import { createGame } from "../engine";
import { chat } from "./llm";
import { parseReviewReply } from "../sandbox";

export interface ReviewResult {
  ok: boolean;
  rating: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  latencyMs: number;
  raw?: string;
  error?: string;
}

export interface TrajectoryStep {
  turn: number;
  action: string;
  valid: boolean;
  reason?: string;
  thought?: string;
  events: { type: string; [k: string]: unknown }[];
}

export async function reviewRun(
  level: LevelDef,
  trajectory: TrajectoryStep[],
  meta: { status: string; moves: number; deaths: number; minMoves: number; model: string },
): Promise<ReviewResult> {
  const initial = renderAscii(levelToState(level));

  const lines: string[] = [];
  lines.push(`LEVEL "${level.name}" (optimal play: ${meta.minMoves} moves):`);
  lines.push(initial);
  lines.push("");
  lines.push(
    `AGENT: ${meta.model} | RESULT: ${meta.status.toUpperCase()} | moves: ${meta.moves} | deaths: ${meta.deaths}`,
  );
  lines.push("");
  lines.push("ACTION LOG (with the agent's own thoughts):");
  for (const s of trajectory) {
    const ev = s.events.map((e) => e.type).join(",");
    const note = s.valid ? (ev ? ` [${ev}]` : "") : ` [REJECTED: ${s.reason}]`;
    const thought = s.thought ? ` — "${s.thought.slice(0, 220)}"` : "";
    lines.push(`${s.turn}. ${s.action}${note}${thought}`);
  }

  const res = await chat(
    [
      { role: "system", content: reviewerSystemPrompt() },
      { role: "user", content: lines.join("\n") },
    ],
    { role: "reviewer", maxTokens: 900 },
  );

  if (!res.ok) {
    return {
      ok: false,
      rating: 0,
      summary: `reviewer unavailable: ${res.error}`,
      strengths: [],
      weaknesses: [],
      suggestions: [],
      latencyMs: res.latencyMs,
      error: res.error,
    };
  }

  // L2 · output quarantine — strict schema verdict
  const verdict = parseReviewReply(res.text);

  if (!verdict.ok || !verdict.review) {
    return {
      ok: false,
      rating: 0,
      summary: verdict.review
        ? `reviewer output rejected by sandbox (${verdict.violations.join("; ")})`
        : "reviewer returned unparseable output",
      strengths: verdict.review?.strengths ?? [],
      weaknesses: verdict.review?.weaknesses ?? [],
      suggestions: verdict.review?.suggestions ?? [],
      latencyMs: res.latencyMs,
      raw: res.text,
      error: "sandbox-rejected",
    };
  }

  return {
    ok: true,
    rating: Math.max(1, Math.min(10, verdict.review.rating)),
    summary: verdict.review.summary,
    strengths: verdict.review.strengths.slice(0, 6),
    weaknesses: verdict.review.weaknesses.slice(0, 6),
    suggestions: verdict.review.suggestions.slice(0, 6),
    latencyMs: res.latencyMs,
    raw: res.text,
  };
}

function levelToState(level: LevelDef) {
  return createGame(level);
}
