// ── WYRM.LAB · Difficulty Index v4 — evidence-based, multi-dimensional ─
// The old index counted mechanic families and added points. This one
// MEASURES the level: it replays the certified optimal solution through
// the real engine, records every irreversible act, every forced ice
// simulation, every position where a legal alternative would kill you,
// and folds EIGHT measured dimensions into one honest 0–10 score.
//
//   depth          how far the optimal plan stretches (moves) — THE
//                  headline metric: hardness by minimal turns. A level
//                  whose best line is long is a level that demands a
//                  long, exact, non-greedy plan (weight raised in v4).
//   search         combinatorial width (BFS states explored, log scale)
//   irreversibility permanent world mutations on the optimal line
//                  (digs, unlocks, valve lock-ins, burned bridges, splits)
//   simulation     forced multi-cell ice glides the winner must trace
//   threat         fraction of legal alternatives that end the run
//                  (spikes AND cracked eggs — both kill)
//   choreography   sub-goal ordering load (pushes, plates, keys, splits)
//   custody        egg-care pressure on the winning line (v4): turns
//                  spent carrying an egg on your body + decision points
//                  where a wrong legal move cracks one
//   budget         turn-limit pressure (1 − par/limit)
//
// Composite = weighted sum → 0–10 (one decimal) + tier label.
// A spike-free corridor puzzle can never score NIGHTMARE — the index
// refuses to inflate what the level does not actually contain.

import { Action, LevelDef } from "./types";
import { createGame, step } from "./engine";

export interface DifficultyDimensions {
  depth: number;
  search: number;
  irreversibility: number;
  simulation: number;
  threat: number;
  choreography: number;
  budget: number;
  custody: number;
}

export interface DifficultyEvidence {
  minMoves: number;
  statesExplored: number;
  digs: number;
  pushes: number;
  unlocks: number;
  valveEntries: number;
  bridgesBurned: number;
  splits: number;
  slides: number;
  slideCells: number;
  spikeAdjacentStops: number;
  legalMoves: number;
  fatalMoves: number;
  decisionPoints: number;
  sampledStates: number;
  plates: number;
  keys: number;
  apples: number;
  eggs: number;
  eggCarryTurns: number;
  eggPerilPoints: number;
  turnLimit: number;
}

export interface DifficultyReport {
  score: number; // 0..10, one decimal
  tier: DifficultyTier;
  dimensions: DifficultyDimensions; // each 0..100
  evidence: DifficultyEvidence;
}

export type DifficultyTier =
  | "TUTORIAL"
  | "CORE"
  | "ADVANCED"
  | "GAUNTLET"
  | "ABYSS"
  | "NIGHTMARE";

export const TIER_ORDER: DifficultyTier[] = [
  "TUTORIAL", "CORE", "ADVANCED", "GAUNTLET", "ABYSS", "NIGHTMARE",
];

export function tierOf(score: number): DifficultyTier {
  if (score < 3) return "TUTORIAL";
  if (score < 5) return "CORE";
  if (score < 6.5) return "ADVANCED";
  if (score < 8) return "GAUNTLET";
  if (score < 9) return "ABYSS";
  return "NIGHTMARE";
}

export const TIER_BLURB: Record<DifficultyTier, string> = {
  TUTORIAL: "movement basics — a warm-up lap",
  CORE: "one or two mechanic families, forgiving of error",
  ADVANCED: "compound planning; greedy play starts failing",
  GAUNTLET: "interlocked mechanics under real pressure",
  ABYSS: "frontier-model territory — most agents drown here",
  NIGHTMARE: "everything, interlocked, with no second chances",
};

// ── weights (sum = 1) — v4 rebalance: minimal turns (depth) leads ────
const W = {
  depth: 0.22,
  search: 0.09,
  irreversibility: 0.14,
  simulation: 0.11,
  threat: 0.16,
  choreography: 0.12,
  budget: 0.09,
  custody: 0.07,
} as const;

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
/** Smooth saturating curve: x=0→0, x=k→63, 2k→86, …→100. */
const sat = (x: number, k: number) => clamp100(100 * (1 - Math.exp(-x / k)));

/** Neighbours of p (4-connected, bounds-checked by caller via terrain). */
const VALVE_CHARS = new Set([">", "<", "^", "v"]);

export interface DifficultyBase {
  plates: number;
  apples: number;
  crates: number;
  dirt: number;
  keys: number;
  valves: number;
  bridges: number;
  ice: number;
  eggs: number;
}

/**
 * Compute the full difficulty report for a SOLVED level.
 * `solution` must be the certified optimal action line.
 */
export function computeDifficulty(
  level: LevelDef,
  minMoves: number,
  statesExplored: number,
  solution: Action[],
  base: DifficultyBase,
): DifficultyReport {
  // ── replay the optimal line through the real engine ────────────────
  let state = createGame(level);
  const ev: DifficultyEvidence = {
    minMoves,
    statesExplored,
    digs: 0, pushes: 0, unlocks: 0, valveEntries: 0, bridgesBurned: 0,
    splits: 0, slides: 0, slideCells: 0, spikeAdjacentStops: 0,
    legalMoves: 0, fatalMoves: 0, decisionPoints: 0, sampledStates: 0,
    plates: base.plates, keys: base.keys, apples: base.apples,
    eggs: base.eggs, eggCarryTurns: 0, eggPerilPoints: 0,
    turnLimit: level.turnLimit ?? 120,
  };

  const ACTIONS: Action[] = ["up", "down", "left", "right", "split"];
  const spikeAdj = (x: number, y: number): boolean => {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= state.terrain.length) continue;
      const row = state.terrain[ny];
      if (nx < 0 || nx >= row.length) continue;
      if (row[nx] === "~") return true;
    }
    return false;
  };

  // sample every state along the line (all of them — the line is short)
  for (let i = 0; i <= solution.length; i++) {
    // threat probe: enumerate legal alternatives, count the fatal ones
    let legal = 0, fatal = 0;
    let eggPerilHere = false;
    for (const a of ACTIONS) {
      const r = step(state, a);
      if (!r.valid) continue;
      legal++;
      if (r.state.status === "dead") fatal++;
      if (r.events.some((e) => e.type === "egg-crack")) eggPerilHere = true;
    }
    if (legal > 0) {
      ev.sampledStates++;
      ev.legalMoves += legal;
      ev.fatalMoves += fatal;
      if (legal >= 3) ev.decisionPoints++;
      if (eggPerilHere) ev.eggPerilPoints++;
    }
    // egg custody: any egg currently riding on the worm's back?
    if (
      state.eggs.some((e) =>
        state.worm.some((w) => w.x === e.x && w.y === e.y + 1))
    ) {
      ev.eggCarryTurns++;
    }
    const head = state.worm[0];
    if (spikeAdj(head.x, head.y)) ev.spikeAdjacentStops++;

    if (i === solution.length) break;
    const a = solution[i];
    const r = step(state, a);
    if (!r.valid) break; // certified line — cannot happen
    state = r.state;
    for (const e of r.events) {
      if (e.type === "dig") ev.digs++;
      else if (e.type === "push") ev.pushes++;
      else if (e.type === "unlock") ev.unlocks++;
      else if (e.type === "split") ev.splits++;
      else if (e.type === "crumble") ev.bridgesBurned++;
      else if (e.type === "slide") { ev.slides++; ev.slideCells += e.cells; }
    }
    // valve entry: the head now stands on a one-way tile
    const h = state.worm[0];
    if (VALVE_CHARS.has(state.terrain[h.y]?.[h.x] ?? "")) ev.valveEntries++;
  }

  // ── dimensions ─────────────────────────────────────────────────────
  const dims: DifficultyDimensions = {
    // optimal plan length (v4: the headline — saturates slower so long
    // razor lines keep separating): 11→40, 22→63, 44→86, 70→96
    depth: sat(minMoves, 22),
    // combinatorial width: 1k states→0, 10k→50, 100k→100 (log scale)
    search: clamp100((Math.log10(Math.max(10, statesExplored)) - 3) * 50),
    // permanent mutations on the winning line
    irreversibility: sat(ev.digs + ev.unlocks + ev.valveEntries + ev.bridgesBurned + ev.splits * 1.5, 3.5),
    // forced multi-cell glides + ice presence pressure
    simulation: sat(ev.slides * 2 + ev.slideCells * 0.35 + base.ice * 0.15, 6),
    // how many of your own legal moves would end the run (spikes AND eggs)
    threat: clamp100(
      100 * Math.pow(ev.legalMoves ? ev.fatalMoves / ev.legalMoves : 0, 0.7) +
        Math.min(30, ev.spikeAdjacentStops * 8),
    ),
    // sub-goal ordering load
    choreography: clamp100(
      ev.pushes * 22 +
        (base.plates > 1 ? base.plates * 14 : 0) +
        ev.splits * 30 +
        base.keys * 18 +
        Math.max(0, base.apples - 1) * 7,
    ),
    // turn-limit pressure: par ≈ limit → max; limit ≫ par → ~0
    budget: clamp100(100 * Math.pow(Math.min(1, minMoves / ev.turnLimit), 1.5)),
    // egg custody pressure (v4): turns carrying + one-wrong-move points
    custody: base.eggs > 0
      ? clamp100(ev.eggCarryTurns * 6 + ev.eggPerilPoints * 9)
      : 0,
  };

  const weighted =
    dims.depth * W.depth +
    dims.search * W.search +
    dims.irreversibility * W.irreversibility +
    dims.simulation * W.simulation +
    dims.threat * W.threat +
    dims.choreography * W.choreography +
    dims.budget * W.budget +
    dims.custody * W.custody;

  // Specialist bonus: a level that is EXTREME in any single dimension is
  // genuinely hard even when the others are modest — a pure spike hell, a
  // monster search space, a razor budget, an egg cathedral. The composite
  // therefore blends the weighted mean with the strongest dimension
  // (75 / 25).
  const maxDim = Math.max(
    dims.depth, dims.search, dims.irreversibility,
    dims.simulation, dims.threat, dims.choreography, dims.budget,
    dims.custody,
  );
  const composite = 0.75 * weighted + 0.25 * maxDim;

  const score = Math.round((composite / 10) * 10) / 10;
  return { score, tier: tierOf(score), dimensions: dims, evidence: ev };
}
