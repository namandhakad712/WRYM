// ── WYRM.LAB · New Level Thinker (LLM level designer) ────────────────
// Asks the LLM to design an original level, validates the output with
// the BFS Logic Validator, and runs repair rounds on failure. Falls
// back to the procedural generator when the LLM can't produce a
// certifiable level. Everything (thoughts, failures, repairs) is kept.

import { LevelDef } from "../types";
import { createGame, LevelFormatError } from "../engine";
import { validateLevel } from "../validator";
import { generateLevel } from "../generator";
import { levelDesignerSystemPrompt } from "../ascii";
import { chat, extractJson } from "./llm";

export interface LevelGenResult {
  level: LevelDef;
  source: "llm" | "procedural";
  genThought: string;
  attempts: { round: number; outcome: string; raw?: string }[];
  validatorReport: string;
  fallbackReason?: string;
}

export async function designLevel(opts: {
  avoidNames?: string[];
  avoidGrids?: string[];
  model?: string;
}): Promise<LevelGenResult> {
  const attempts: { round: number; outcome: string; raw?: string }[] = [];
  const userPrompt = [
    "Design ONE new WYRM level.",
    opts.avoidNames?.length ? `Already published (do not repeat): ${opts.avoidNames.slice(-12).join(", ")}.` : "",
    opts.avoidGrids?.length
      ? "Published layouts you must differ from:\n" + opts.avoidGrids.slice(-3).join("\n---\n")
      : "",
    "Remember: enclosed by walls, one X, worm head @ with body o's to its left, mentally verify solvability.",
  ]
    .filter(Boolean)
    .join("\n");

  for (let round = 1; round <= 2; round++) {
    const res = await chat(
      [
        { role: "system", content: levelDesignerSystemPrompt() },
        { role: "user", content: round === 1 ? userPrompt : `${userPrompt}\n\nYOUR PREVIOUS ATTEMPT FAILED:\n${attempts[attempts.length - 1]?.outcome}\nFix the problem and try again.` },
      ],
      { role: "levelThinker", maxTokens: 1400 },
    );

    if (!res.ok) {
      attempts.push({ round, outcome: `LLM unavailable: ${res.error}` });
      continue;
    }

    const parsed = extractJson<{ name?: string; thought?: string; grid?: string[] }>(res.text);
    if (!parsed || !Array.isArray(parsed.grid) || parsed.grid.length < 5) {
      attempts.push({ round, outcome: "unparseable JSON (expected {name, thought, grid[]})", raw: res.text.slice(0, 400) });
      continue;
    }

    const candidate: LevelDef = {
      name: (parsed.name || "Untitled Wyrm").slice(0, 40),
      slug: `llm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      grid: parsed.grid.map((r: string) => r.trim()),
    };

    // format validation
    try {
      createGame(candidate);
    } catch (e) {
      const msg = e instanceof LevelFormatError ? e.message : (e as Error).message;
      attempts.push({ round, outcome: `format error: ${msg}`, raw: res.text.slice(0, 400) });
      continue;
    }

    // logic validation
    const report = validateLevel(candidate);
    if (!report.solvable) {
      attempts.push({
        round,
        outcome: `Logic Validator rejected the level: ${report.reason} (BFS explored ${report.statesExplored} states, no winning line)`,
        raw: res.text.slice(0, 400),
      });
      continue;
    }
    if (report.minMoves < 6) {
      attempts.push({ round, outcome: `too trivial (optimal ${report.minMoves} moves; need ≥6)` });
      continue;
    }

    attempts.push({ round, outcome: `ACCEPTED — solvable in ${report.minMoves}, difficulty ${report.difficulty}/10` });
    return {
      level: candidate,
      source: "llm",
      genThought: parsed.thought ?? res.text.slice(0, 800),
      attempts,
      validatorReport: JSON.stringify(report),
    };
  }

  // fallback: procedural
  const seed = Date.now() % 2_000_000_000;
  try {
    const gen = generateLevel(seed, { minMoves: [8, 40], difficulty: [3, 9] });
    attempts.push({ round: 0, outcome: `procedural fallback engaged (seed ${seed}, ${gen.attempts} attempts)` });
    return {
      level: gen.level,
      source: "procedural",
      genThought: `[procedural generator] synthesized ${gen.attempts} candidate(s) with seed ${seed}; accepted layout solved optimally in ${gen.report.minMoves} moves, difficulty ${gen.report.difficulty}/10.`,
      attempts,
      validatorReport: JSON.stringify(gen.report),
      fallbackReason: "LLM designs did not pass the Logic Validator",
    };
  } catch (e) {
    attempts.push({ round: 0, outcome: `procedural fallback also failed: ${(e as Error).message}` });
    throw new Error(`level generation failed entirely: ${(e as Error).message}`);
  }
}
