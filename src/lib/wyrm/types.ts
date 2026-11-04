// ── WYRM.LAB · shared types ──────────────────────────────────────────
// The game engine is pure & deterministic: same level + same action
// sequence ⇒ same result, on server (agents) and client (renderer).
//
// MECHANIC FAMILIES (v2):
//   classic  — apples, split, crates, plates, doors, dirt, spikes
//   valves   — one-way arrow tiles: enter only WITH the arrow
//   bridges  — crumbling tiles: collapse to rubble once vacated
//   ice      — frictionless floors: entering starts a slide
//   keys     — key pickups + locked tiles consumed on entry

export type Dir = "up" | "down" | "left" | "right";
export type Action = Dir | "split";

export const DIRS: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const DELTA: { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

export interface Pos {
  x: number;
  y: number;
}

export const posEq = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const posKey = (p: Pos) => `${p.x},${p.y}`;

/** Static terrain of a cell (dynamic entities live separately). */
export type Terrain =
  | "#" // wall
  | "." // floor
  | "%" // pressure plate
  | "D" // door (plate-controlled)
  | "X" // exit
  | "~" // spikes
  | "+" // dirt (soft earth — diggable, consumed)
  | ">" // one-way valve: enter only moving right
  | "<" // one-way valve: enter only moving left
  | "^" // one-way valve: enter only moving up
  | "v" // one-way valve: enter only moving down
  | "=" // crumble bridge: collapses to rubble once vacated
  | "_" // ice: frictionless — entering starts a slide
  | "L"; // lock: needs a key; consumed on entry, opens permanently

/** Direction a valve tile points in, or null for non-valve terrain. */
export function valveDir(t: Terrain): Dir | null {
  switch (t) {
    case ">": return "right";
    case "<": return "left";
    case "^": return "up";
    case "v": return "down";
    default: return null;
  }
}

export type GameStatus = "playing" | "won" | "dead" | "exhausted";

export interface GameState {
  width: number;
  height: number;
  terrain: Terrain[][]; // [y][x] — mutated ONLY by dig / crumble / unlock (copied on write)
  crates: Pos[]; // pushable, weighted
  apples: Pos[]; // remaining apples
  keys: Pos[]; // remaining key pickups on the floor
  keysHeld: number; // keys carried by the worm
  remains: Pos[]; // inert dropped halves: solid + weighted
  pits: Pos[]; // cells where a bridge crumbled (rendering hint; terrain is already "#")
  bridgeTouched: string[]; // posKeys of bridges the worm has occupied at least once
  worm: Pos[]; // [0] = head, rest = body
  turn: number; // completed turns
  turnLimit: number; // level move budget
  status: GameStatus;
  lastEvents: GameEvent[]; // events produced by the last action
}

export type GameEvent =
  | { type: "move"; dir: Dir }
  | { type: "slide"; dir: Dir; cells: number } // ice slide — multi-cell, ONE turn
  | { type: "bump"; reason: string }
  | { type: "dig"; at: Pos }
  | { type: "push"; from: Pos; to: Pos }
  | { type: "ate"; at: Pos; newLength: number }
  | { type: "grow"; newLength: number }
  | { type: "split"; kept: number; dropped: number }
  | { type: "plates"; satisfied: number; total: number }
  | { type: "door"; open: boolean }
  | { type: "spike"; at: Pos }
  | { type: "crumble"; at: Pos } // a bridge collapsed behind you
  | { type: "key"; at: Pos; held: number } // key picked up
  | { type: "unlock"; at: Pos; held: number } // lock opened, key consumed
  | { type: "exit-sealed"; applesLeft: number }
  | { type: "win"; at: Pos; moves: number }
  | { type: "death"; at: Pos };

export interface StepResult {
  state: GameState; // new state (immutable copy on success)
  valid: boolean;
  reason?: string; // why invalid
  events: GameEvent[];
}

// ── level definition ────────────────────────────────────────────────
// Level text uses: # wall, . floor, @ head, o body, * apple, $ crate,
// % plate, D door, X exit, ~ spikes, + dirt, > < ^ v valves, = bridge,
// _ ice, k key, L lock.
// The initial worm must be horizontal with the head at its right end
// (body stretches to the left of @), facing right.

export interface LevelDef {
  name: string;
  slug: string;
  grid: string[];
  turnLimit?: number; // move budget (default 120, absolute cap 240)
}

/** Mechanic families present in a level (computed from its terrain). */
export function mechanicFamilies(grid: string[]): string[] {
  const fams = new Set<string>(["classic"]);
  const all = grid.join("");
  if (/[><^v]/.test(all)) fams.add("valves");
  if (all.includes("=")) fams.add("bridges");
  if (all.includes("_")) fams.add("ice");
  if (all.includes("k") || all.includes("L")) fams.add("keys");
  return [...fams];
}

export interface ValidatorReport {
  solvable: boolean;
  minMoves: number;
  solution: Action[];
  statesExplored: number;
  difficulty: number; // 0..10 — v3 evidence-based index (one decimal)
  tier?: string; // TUTORIAL | CORE | ADVANCED | GAUNTLET | ABYSS | NIGHTMARE
  dims?: {
    depth: number;
    search: number;
    irreversibility: number;
    simulation: number;
    threat: number;
    choreography: number;
    budget: number;
  }; // each 0..100 — see lib/wyrm/difficulty.ts
  evidence?: Record<string, number>;
  plates: number;
  apples: number;
  crates: number;
  dirt: number;
  keys: number;
  valves: number;
  bridges: number;
  ice: number;
  splitsRequired: boolean;
  reason?: string;
}
