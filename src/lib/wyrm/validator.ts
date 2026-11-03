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
import { createGame, step, platePositions } from "./engine";

const MAX_STATES = 400_000;

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
  const phase1 = bfs(level, MOVE_ACTIONS, false);
  if (phase1.solvable) return phase1;
  return bfs(level, ACTIONS, true);
}

function bfs(level: LevelDef, actions: Action[], allowSplit: boolean): ValidatorReport {
  const start = createGame(level);
  const plates = platePositions(start);
  const apples = start.apples.length;
  const crates = start.crates.length;
  const keys = start.keys.length;
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
  };

  const startKey = stateKey(start);
  const seen = new Set<string>([startKey]);
  const queue: Node[] = [{ state: start, parent: null, action: null }];
  let explored = 0;
  let splitsSeen = false;

  while (queue.length > 0 && explored < MAX_STATES) {
    const node = queue.shift()!;
    explored++;

    if (node.state.status === "won") {
      // reconstruct path
      const solution: Action[] = [];
      let n: Node | null = node;
      while (n && n.action) {
        solution.unshift(n.action);
        n = n.parent;
      }
      return {
        solvable: true,
        minMoves: solution.length,
        solution,
        statesExplored: explored,
        difficulty: scoreDifficulty(solution.length, explored, solution, base),
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

function scoreDifficulty(
  minMoves: number,
  explored: number,
  solution: Action[],
  base: { plates: number; apples: number; crates: number; dirt: number; keys: number; valves: number; bridges: number; ice: number },
): number {
  let d = 0;
  d += Math.min(3, Math.floor(minMoves / 10)); // solution length up to 3
  d += Math.min(2, Math.floor(Math.log10(Math.max(10, explored)) - 1)); // search-space breadth
  if (solution.includes("split")) d += 2; // self-amputation is hard
  if (base.crates > 0) d += 1;
  if (base.plates > 1) d += 1;
  if (base.dirt >= 3) d += 1; // excavation adds pathing decisions
  if (base.ice >= 3) d += 1; // forced multi-cell simulation
  if (base.ice >= 6) d += 1;
  if (base.valves >= 3) d += 1; // route irreversibility
  if (base.keys > 0) d += 1; // inventory bookkeeping
  if (base.bridges >= 3) d += 1; // consumable geometry
  d = Math.max(1, Math.min(10, d));
  return d;
}

/** Quick solve used by the baseline solver agent (wyrm-bfs). */
export function bfsSolution(level: LevelDef): Action[] | null {
  const report = validateLevel(level);
  return report.solvable ? report.solution : null;
}

