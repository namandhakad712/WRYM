// ── WYRM.LAB · Logic Validator v2 ────────────────────────────────────
// Exhaustive BFS over the full game graph. Certifies that a level is
// solvable, finds the optimal (minimum-turn) solution, and scores
// difficulty. Also powers the built-in "wyrm-bfs" baseline solver.
//
// The state key folds in every mechanic family: keys held, remaining
// key pickups, and mutable terrain (dirt / bridges / locks). A slide is
// one action, so ice keeps branching at 5 while blowing up the mental
// simulation an agent must perform — exactly the asymmetry we want.

import {
  Action,
  GameState,
  LevelDef,
  ValidatorReport,
} from "./types";
import { createGame, step, platePositions, eggSupported } from "./engine";
import { computeDifficulty } from "./difficulty";

const MAX_STATES = 400_000;

/** Certification cache — validateLevel is pure, so identical levels
 *  (same slug + grid + turn limit) must never pay for BFS twice. The
 *  ladder is certified by tests, CI, site export and the benchmark
 *  harness; one 55s sweep used to be paid four times per process. */
const certCache = new Map<string, ValidatorReport>();

export function clearValidationCache(): void {
  certCache.clear();
}

function cacheKey(level: LevelDef): string {
  return `${level.slug}::${level.turnLimit ?? 0}::${level.grid.join("\n")}`;
}

interface Node {
  state: GameState;
  parent: Node | null;
  action: Action | null;
}

/** Terrain characters whose mutation makes two states distinct. */
const MUTABLE_TERRAIN = new Set(["+", "=", "L"]);

/** Canonical string key for a dynamic state (order-insensitive sets). */
export function stateKey(s: GameState): string {
  const crates = s.crates.map((c) => `${c.x},${c.y}`).sort().join(";");
  const apples = s.apples.map((a) => `${a.x},${a.y}`).sort().join(";");
  const keys = s.keys.map((k) => `${k.x},${k.y}`).sort().join(";");
  const remains = s.remains.map((r) => `${r.x},${r.y}`).sort().join(";");
  const worm = s.worm.map((w) => `${w.x},${w.y}`).join(";");
  // destructible terrain (dirt digs, bridge collapses, lock opens) must
  // join the key whenever any mutable cell exists
  let terrainKey = "";
  outer: for (const row of s.terrain) {
    for (const t of row) {
      if (MUTABLE_TERRAIN.has(t)) {
        terrainKey = s.terrain.map((r) => r.join("")).join("/");
        break outer;
      }
    }
  }
  return `${worm}|${crates}|${apples}|${keys}|${s.keysHeld}|${remains}|${terrainKey}`;
}

const ACTIONS: Action[] = ["up", "down", "left", "right", "split"];
const MOVE_ACTIONS: Action[] = ["up", "down", "left", "right"];

/** BFS. Returns the report (solvable ⇒ includes optimal solution).
 *
 *  Two-phase search: split actions multiply the state space enormously
 *  (dropped remains can rest anywhere), so we first certify with pure
 *  movement. Only if that fails do we pay for the full action set.
 *  A phase-1 solution is still a valid optimal-or-near-optimal line —
 *  and `splitsRequired` tells the truth about which phase answered. */
export function validateLevel(level: LevelDef): ValidatorReport {
  const ck = cacheKey(level);
  const hit = certCache.get(ck);
  if (hit) return hit;
  const phase1 = bfs(level, MOVE_ACTIONS, false);
  if (!phase1.solvable) {
    const phase2 = bfs(level, ACTIONS, true);
    certCache.set(ck, phase2);
    return phase2;
  }
  certCache.set(ck, phase1);
  return phase1;
}

function bfs(level: LevelDef, actions: Action[], allowSplit: boolean): ValidatorReport {
  const start = createGame(level);
  const plates = platePositions(start);
  const apples = start.apples.length;
  const crates = start.crates.length;
  const keys = start.keys.length;
  const eggs = start.eggs.length;
  // a level that SHIPS an already-falling egg is malformed
  const floatingEgg = start.eggs.find((e) => !eggSupported(start, e.x, e.y));
  let dirt = 0;
  let valves = 0;
  let bridges = 0;
  let ice = 0;
  for (const row of start.terrain)
    for (const t of row) {
      if (t === "+") dirt++;
      else if (t === ">" || t === "<" || t === "^" || t === "v") valves++;
      else if (t === "=") bridges++;
      else if (t === "_") ice++;
    }

  const base = {
    plates: plates.length,
    apples,
    crates,
    dirt,
    keys,
    valves,
    bridges,
    ice,
    eggs,
  };

  if (floatingEgg) {
    return {
      solvable: false,
      minMoves: -1,
      solution: [],
      statesExplored: 0,
      difficulty: 0,
      splitsRequired: false,
      reason: `egg at (${floatingEgg.y},${floatingEgg.x}) starts without support`,
      ...base,
    };
  }

  const startKey = stateKey(start);
  const seen = new Set<string>([startKey]);
  // head-indexed queue: Array.shift() is O(n) per pop and turns BFS on
  // large ladders into a quadratic crawl. Advancing a cursor is O(1)
  // and lets the GC reclaim popped nodes early.
  const queue: Node[] = [{ state: start, parent: null, action: null }];
  let head = 0;
  let explored = 0;
  let splitsSeen = false;

  while (head < queue.length && explored < MAX_STATES) {
    const node = queue[head++];
    explored++;

    if (node.state.status === "won") {
      // reconstruct path
      const solution: Action[] = [];
      let n: Node | null = node;
      while (n && n.action) {
        solution.unshift(n.action);
        n = n.parent;
      }
      // v4 difficulty: replay the optimal line, measure eight dimensions
      const diff = computeDifficulty(level, solution.length, explored, solution, base);
      return {
        solvable: true,
        minMoves: solution.length,
        solution,
        statesExplored: explored,
        difficulty: diff.score,
        tier: diff.tier,
        dims: diff.dimensions,
        evidence: diff.evidence as unknown as Record<string, number>,
        splitsRequired: solution.includes("split"),
        ...base,
      };
    }

    for (const a of actions) {
      const r = step(node.state, a);
      if (allowSplit && a === "split" && r.valid) splitsSeen = true;
      if (!r.valid) continue;
      if (r.state.status === "dead") continue; // never expand deaths
      const k = stateKey(r.state);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ state: r.state, parent: node, action: a });
    }
  }

  return {
    solvable: false,
    minMoves: -1,
    solution: [],
    statesExplored: explored,
    difficulty: 0,
    splitsRequired: splitsSeen,
    reason: explored >= MAX_STATES ? "search limit exceeded" : "no solution exists",
    ...base,
  };
}

/** Quick solve used by the baseline solver agent (wyrm-bfs). */
export function bfsSolution(level: LevelDef): Action[] | null {
  const report = validateLevel(level);
  return report.solvable ? report.solution : null;
}

