// ── WYRM.LAB · game engine v2 ────────────────────────────────────────
// Deterministic grid-worm puzzle engine. Pure functions, no I/O.
//
// Rules (v2):
//  · Actions: up / down / left / right / split.
//  · Invalid moves (wall, closed door, own body, blocked crate, wrong-way
//    valve, locked tile) consume NO turn — they are recorded with a reason
//    so agents can learn.
//  · Apple: eaten on contact, worm grows by 1 (tail keeps its cell).
//  · Exit: sealed until every apple is eaten; head on open exit ⇒ WIN.
//  · Spikes: instant death (also reachable mid-slide — ice does not stop).
//  · Crates: pushed sokoban-style; land on floor / plate / bridge / valve.
//  · Plates: weighted by crate / remains / worm segment.
//  · Doors: block ENTRY while any plate is unweighted.
//  · Split: cut the worm — keep the front half (with head), the back
//    half becomes inert "remains" (solid + counts as plate weight).
//  · VALVES (> < ^ v): floor that may only be ENTERED moving with the
//    arrow. Standing on / leaving a valve is free. The only way back is
//    a loop — plan the route.
//  · BRIDGES (=): enterable once. While occupied the span holds; the
//    moment the last weight leaves, the tile crumbles to rubble (#).
//    Crossing is one-way, forever.
//  · ICE (_): entering a frictionless tile starts a SLIDE — the worm
//    keeps moving in the same direction until its head lands on a
//    non-ice cell or is stopped by an obstacle. A whole slide is ONE
//    turn. Sliding into spikes kills; sliding cannot dig or push.
//  · KEYS (k) & LOCKS (L): walking over a key picks it up. Entering a
//    locked tile consumes one key and opens it permanently.
//  · Tail-follow is legal (moving into your own tail cell).
//  · Each level carries its own move budget (turnLimit); exceeding it
//    ends the run as "exhausted".

import {
  Action,
  Dir,
  GameEvent,
  GameState,
  LevelDef,
  Pos,
  Terrain,
  DIRS,
  posEq,
  posKey,
  valveDir,
} from "./types";

export const MAX_TURNS = 240; // absolute cap; levels usually set tighter budgets
export const DEFAULT_TURN_LIMIT = 120;
export const CHARS = {
  wall: "#",
  floor: ".",
  head: "@",
  body: "o",
  apple: "*",
  crate: "$",
  plate: "%",
  door: "D",
  exit: "X",
  spike: "~",
  remain: ":",
  dirt: "+",
  key: "k",
} as const;

export class LevelFormatError extends Error {}

/** Parse a level definition into an initial GameState. */
export function createGame(level: LevelDef): GameState {
  const rows = level.grid.map((r) => r);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new LevelFormatError("empty level");
  if (!rows.every((r) => r.length === width))
    throw new LevelFormatError("ragged rows");

  const terrain: Terrain[][] = [];
  const crates: Pos[] = [];
  const apples: Pos[] = [];
  const keys: Pos[] = [];
  const worm: Pos[] = [];
  let exits = 0;

  const terrainChars = new Set<string>([
    CHARS.wall, CHARS.floor, CHARS.plate, CHARS.door, CHARS.exit,
    CHARS.spike, CHARS.dirt, ">", "<", "^", "v", "=", "_", "L",
  ]);

  for (let y = 0; y < height; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (terrainChars.has(ch)) {
        row.push(ch as Terrain);
        if (ch === CHARS.exit) exits++;
      } else if (ch === CHARS.apple) {
        row.push(".");
        apples.push({ x, y });
      } else if (ch === CHARS.crate) {
        row.push(".");
        crates.push({ x, y });
      } else if (ch === CHARS.key) {
        row.push(".");
        keys.push({ x, y });
      } else if (ch === CHARS.head) {
        row.push(".");
        worm[0] = { x, y };
      } else if (ch === CHARS.body) {
        row.push(".");
        worm.push({ x, y });
      } else {
        throw new LevelFormatError(`unknown char '${ch}' at ${x},${y}`);
      }
    }
    terrain.push(row);
  }

  if (!worm[0]) throw new LevelFormatError("no worm head '@'");
  if (exits !== 1) throw new LevelFormatError(`expected 1 exit, found ${exits}`);
  if (worm.length < 1) throw new LevelFormatError("worm too short");

  // normalize worm order: head first; initial levels lay the worm out
  // horizontally with the head at the right end, body stretching left.
  if (worm.length > 1) {
    const [head, ...body] = worm;
    body.reverse();
    worm.splice(0, worm.length, head, ...body);
    for (let i = 1; i < worm.length; i++) {
      const dx = Math.abs(worm[i].x - worm[i - 1].x);
      const dy = Math.abs(worm[i].y - worm[i - 1].y);
      if (dx + dy !== 1)
        throw new LevelFormatError("initial worm must be a contiguous line");
    }
  }

  const turnLimit = Math.min(level.turnLimit ?? DEFAULT_TURN_LIMIT, MAX_TURNS);

  return {
    width,
    height,
    terrain,
    crates,
    apples,
    keys,
    keysHeld: 0,
    remains: [],
    pits: [],
    bridgeTouched: [],
    worm,
    turn: 0,
    turnLimit,
    status: "playing",
    lastEvents: [],
  };
}

/** All plates present in the level. */
export function platePositions(s: GameState): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++)
      if (s.terrain[y][x] === "%") out.push({ x, y });
  return out;
}

export function doorsOpen(s: GameState): boolean {
  const plates = platePositions(s);
  if (plates.length === 0) return true;
  const weighted = occupied(s);
  return plates.every((p) => weighted.has(posKey(p)));
}

export function platesSatisfied(s: GameState): { satisfied: number; total: number } {
  const plates = platePositions(s);
  const weighted = occupied(s);
  const satisfied = plates.filter((p) => weighted.has(posKey(p))).length;
  return { satisfied, total: plates.length };
}

/** posKeys of every cell carrying weight (crate / remains / worm). */
function occupied(s: GameState): Set<string> {
  const set = new Set<string>();
  for (const c of s.crates) set.add(posKey(c));
  for (const r of s.remains) set.add(posKey(r));
  for (const w of s.worm) set.add(posKey(w));
  return set;
}

function clone(s: GameState): GameState {
  return {
    width: s.width,
    height: s.height,
    terrain: s.terrain, // never mutated in place — copy-on-write
    crates: s.crates.map((c) => ({ ...c })),
    apples: s.apples.map((a) => ({ ...a })),
    keys: s.keys.map((k) => ({ ...k })),
    keysHeld: s.keysHeld,
    remains: s.remains.map((r) => ({ ...r })),
    pits: s.pits.map((p) => ({ ...p })),
    bridgeTouched: [...s.bridgeTouched],
    worm: s.worm.map((w) => ({ ...w })),
    turn: s.turn,
    turnLimit: s.turnLimit,
    status: s.status,
    lastEvents: [],
  };
}

/** Snapshot the dynamic state as a compact JSON string (for DB / replay). */
export function serializeState(s: GameState): string {
  return JSON.stringify({
    w: s.width,
    h: s.height,
    t: s.terrain.map((r) => r.join("")),
    c: s.crates,
    a: s.apples,
    k: s.keys,
    kh: s.keysHeld,
    r: s.remains,
    p: s.pits,
    bt: s.bridgeTouched,
    m: s.worm,
    n: s.turn,
    tl: s.turnLimit,
    s: s.status,
  });
}

export function deserializeState(json: string): GameState {
  const d = JSON.parse(json);
  return {
    width: d.w,
    height: d.h,
    terrain: d.t.map((r: string) => r.split("") as Terrain[]),
    crates: d.c,
    apples: d.a,
    keys: d.k ?? [],
    keysHeld: d.kh ?? 0,
    remains: d.r,
    pits: d.p ?? [],
    bridgeTouched: d.bt ?? [],
    worm: d.m,
    turn: d.n,
    turnLimit: d.tl ?? DEFAULT_TURN_LIMIT,
    status: d.s,
    lastEvents: [],
  };
}

/** Build the entity overlay grid (terrain + dynamics) — used by renderers. */
export function buildOverlay(s: GameState) {
  const grid: { terrain: Terrain; entity: string | null; wormIndex: number }[][] = [];
  for (let y = 0; y < s.height; y++) {
    const row: { terrain: Terrain; entity: string | null; wormIndex: number }[] = [];
    for (let x = 0; x < s.width; x++) {
      row.push({ terrain: s.terrain[y][x], entity: null, wormIndex: -1 });
    }
    grid.push(row);
  }
  s.apples.forEach((p) => (grid[p.y][p.x].entity = "apple"));
  s.crates.forEach((p) => (grid[p.y][p.x].entity = "crate"));
  s.keys.forEach((p) => (grid[p.y][p.x].entity = "key"));
  s.remains.forEach((p) => (grid[p.y][p.x].entity = "remain"));
  s.worm.forEach((p, i) => {
    grid[p.y][p.x].entity = i === 0 ? "head" : "body";
    grid[p.y][p.x].wormIndex = i;
  });
  return grid;
}

// ── entry analysis ───────────────────────────────────────────────────

type EntryCheck =
  | { ok: true; terrain: Terrain }
  | { ok: false; reason: string; bump: string };

/** Can the worm HEAD enter (x,y) moving in direction `dir`?
 *  Covers walls, valves, locks, doors — NOT bodies/crates (checked by
 *  the caller, because the slide loop treats them differently). */
function checkEntry(s: GameState, x: number, y: number, dir: Dir): EntryCheck {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height)
    return { ok: false, reason: "wall", bump: "wall" };
  const terr = s.terrain[y][x];
  if (terr === "#")
    return { ok: false, reason: "wall", bump: "wall" };
  const vd = valveDir(terr);
  if (vd && vd !== dir)
    return { ok: false, reason: `one-way valve — it only lets you pass moving ${vd}`, bump: "one-way valve" };
  if (terr === "L" && s.keysHeld === 0)
    return { ok: false, reason: "locked — you need a key (k) to open this", bump: "locked tile" };
  if (terr === "D" && !doorsOpen(s))
    return { ok: false, reason: `door is closed — plates ${platesSatisfied(s).satisfied}/${platesSatisfied(s).total} weighted`, bump: "closed door" };
  return { ok: true, terrain: terr };
}

/** Copy terrain row for a mutation at (x,y) — copy-on-write. */
function withTerrain(s: GameState, x: number, y: number, t: Terrain): Terrain[][] {
  const terrain = s.terrain.map((r, ry) => (ry === y ? [...r] : r));
  terrain[y][x] = t;
  return terrain;
}

/** Crumble every bridge the worm has touched that now carries no weight.
 *  Mutates `ns` (a private clone) and appends events. */
function crumblePass(ns: GameState, events: GameEvent[]): void {
  if (ns.bridgeTouched.length === 0) return;
  const weight = occupied(ns);
  const stillTouched: string[] = [];
  for (const key of ns.bridgeTouched) {
    const [x, y] = key.split(",").map(Number);
    if (weight.has(key)) {
      stillTouched.push(key);
      continue;
    }
    // vacated bridge collapses into rubble
    ns.terrain = withTerrain(ns, x, y, "#");
    ns.pits.push({ x, y });
    events.push({ type: "crumble", at: { x, y } });
  }
  ns.bridgeTouched = stillTouched;
}

/** Note bridge cells now under the worm so they crumble when vacated. */
function touchBridges(ns: GameState): void {
  const weight = occupied(ns);
  for (let y = 0; y < ns.height; y++) {
    for (let x = 0; x < ns.width; x++) {
      if (ns.terrain[y][x] === "=") {
        const key = `${x},${y}`;
        if (weight.has(key) && !ns.bridgeTouched.includes(key)) {
          ns.bridgeTouched.push(key);
        }
      }
    }
  }
}

/** Apply one action. Returns { state, valid, reason, events }.
 *  The input state is never mutated — on success a new state is returned;
 *  on failure the SAME state object is returned with valid=false. */
export function step(s: GameState, action: Action): {
  state: GameState;
  valid: boolean;
  reason?: string;
  events: GameEvent[];
} {
  if (s.status !== "playing") {
    return { state: s, valid: false, reason: `game already ${s.status}`, events: [] };
  }

  const events: GameEvent[] = [];

  if (action === "split") {
    if (s.worm.length < 2) {
      return { state: s, valid: false, reason: "cannot split a single-segment worm", events: [] };
    }
    const ns = clone(s);
    const keep = Math.ceil(ns.worm.length / 2);
    const dropped = ns.worm.splice(keep); // back half falls off
    ns.remains.push(...dropped);
    ns.turn += 1;
    const ps = platesSatisfied(ns);
    events.push({ type: "split", kept: keep, dropped: dropped.length });
    events.push({ type: "plates", ...ps });
    touchBridges(ns); // dropped remains may rest ON a bridge — it then holds
    crumblePass(ns, events);
    ns.lastEvents = events;
    if (ns.turn >= ns.turnLimit && ns.status === "playing") ns.status = "exhausted";
    return { state: ns, valid: true, events };
  }

  const dir = action as Dir;
  const d = DIRS[dir];
  const head = s.worm[0];
  const nx = head.x + d.dx;
  const ny = head.y + d.dy;

  const entry = checkEntry(s, nx, ny, dir);
  if (!entry.ok) {
    return { state: s, valid: false, reason: entry.reason, events: [{ type: "bump", reason: entry.bump }] };
  }
  const terr = entry.terrain;

  // own body / remains block the way — the TAIL cell is legal to enter
  // (it vacates this turn); apple can never sit under the tail so growth
  // never conflicts with tail-follow.
  const bodyHit = s.worm.slice(0, -1).some((p) => p.x === nx && p.y === ny);
  const remainHit = s.remains.some((p) => p.x === nx && p.y === ny);
  if (bodyHit || remainHit) {
    return {
      state: s,
      valid: false,
      reason: bodyHit ? "your own body blocks the way" : "inert remains block the way",
      events: [{ type: "bump", reason: bodyHit ? "own body" : "remains" }],
    };
  }

  // ── crate push ─────────────────────────────────────────────────────
  const crateIdx = s.crates.findIndex((p) => p.x === nx && p.y === ny);
  if (crateIdx >= 0) {
    const bx = nx + d.dx;
    const by = ny + d.dy;
    const bOutside = bx < 0 || by < 0 || bx >= s.width || by >= s.height;
    const bTerr: Terrain | null = bOutside ? null : s.terrain[by][bx];
    // crates land on floor, plates, bridges and valves — never on ice
    // (frictionless), locks, doors, dirt, spikes, exits or entities
    const landOk =
      !bOutside &&
      bTerr !== null &&
      (bTerr === "." || bTerr === "%" || bTerr === "=" || valveDir(bTerr) !== null);
    const bBlocked =
      !landOk ||
      s.crates.some((p) => p.x === bx && p.y === by) ||
      s.remains.some((p) => p.x === bx && p.y === by) ||
      s.worm.some((p) => p.x === bx && p.y === by) ||
      s.apples.some((p) => p.x === bx && p.y === by) ||
      s.keys.some((p) => p.x === bx && p.y === by);
    if (bBlocked) {
      return {
        state: s,
        valid: false,
        reason: bTerr === "_" ? "a crate cannot be pushed onto ice — it would slide away" : "crate cannot be pushed there",
        events: [{ type: "bump", reason: bTerr === "_" ? "crate onto ice" : "crate blocked" }],
      };
    }
    const ns = clone(s);
    ns.crates[crateIdx] = { x: bx, y: by };
    ns.worm.unshift({ x: nx, y: ny });
    ns.worm.pop();
    ns.turn += 1;
    const ps = platesSatisfied(ns);
    events.push({ type: "move", dir });
    events.push({ type: "push", from: { x: nx, y: ny }, to: { x: bx, y: by } });
    events.push({ type: "plates", ...ps });
    touchBridges(ns);
    crumblePass(ns, events);
    ns.lastEvents = events;
    if (ns.turn >= ns.turnLimit && ns.status === "playing") ns.status = "exhausted";
    return { state: ns, valid: true, events };
  }

  // ── plain movement (possibly an ice slide) ─────────────────────────
  const ns = clone(s);

  // digging through soft dirt: the cell crumbles into open floor
  if (terr === "+") {
    ns.terrain = withTerrain(ns, nx, ny, ".");
    events.push({ type: "dig", at: { x: nx, y: ny } });
  }

  // unlocking: entering a lock consumes a key and opens it
  if (terr === "L") {
    ns.keysHeld -= 1;
    ns.terrain = withTerrain(ns, nx, ny, ".");
    events.push({ type: "unlock", at: { x: nx, y: ny }, held: ns.keysHeld });
  }

  ns.worm.unshift({ x: nx, y: ny });

  // spikes kill — also mid-slide (checked inside the loop below)
  if (terr === "~") {
    ns.worm.pop();
    ns.turn += 1;
    ns.status = "dead";
    events.push({ type: "move", dir });
    events.push({ type: "spike", at: { x: nx, y: ny } });
    events.push({ type: "death", at: { x: nx, y: ny } });
    ns.lastEvents = events;
    return { state: ns, valid: true, events };
  }

  // ── ICE SLIDE ───────────────────────────────────────────────────────
  // Entering a frictionless tile keeps the worm moving until the head
  // lands on a non-ice cell or is stopped. One slide = one turn.
  let slideCells = 0;
  if (terr === "_") {
    events.push({ type: "move", dir });
    let cx = nx;
    let cy = ny;
    for (;;) {
      // pick up a key resting on the ice we just crossed
      const keyIdx = ns.keys.findIndex((p) => p.x === cx && p.y === cy);
      if (keyIdx >= 0) {
        ns.keys.splice(keyIdx, 1);
        ns.keysHeld += 1;
        events.push({ type: "key", at: { x: cx, y: cy }, held: ns.keysHeld });
      }
      if (ns.terrain[cy][cx] !== "_") break; // landed on grippy ground
      const tx = cx + d.dx;
      const ty = cy + d.dy;
      const next = checkEntry(ns, tx, ty, dir);
      const nextTerr = next.ok ? next.terrain : null;
      const blockedByEntity = next.ok
        ? ns.worm.some((p, i) => i < ns.worm.length - 1 && p.x === tx && p.y === ty) ||
          ns.remains.some((p) => p.x === tx && p.y === ty) ||
          ns.crates.some((p) => p.x === tx && p.y === ty)
        : true;
      // dirt, crates, bodies, walls, wrong-way valves stop the slide
      if (!next.ok || blockedByEntity || nextTerr === "+") {
        break; // stopped ON the ice
      }
      // advance the head one more cell
      cx = tx;
      cy = ty;
      slideCells++;
      ns.worm.unshift({ x: cx, y: cy });
      if (nextTerr === "L") {
        // sliding through a lock opens it (consumes a key)
        ns.keysHeld -= 1;
        ns.terrain = withTerrain(ns, cx, cy, ".");
        events.push({ type: "unlock", at: { x: cx, y: cy }, held: ns.keysHeld });
      }
      if (nextTerr === "~") {
        // sliding into spikes is fatal
        ns.turn += 1;
        ns.status = "dead";
        events.push({ type: "slide", dir, cells: slideCells });
        events.push({ type: "spike", at: { x: cx, y: cy } });
        events.push({ type: "death", at: { x: cx, y: cy } });
        ns.worm.pop();
        ns.lastEvents = events;
        return { state: ns, valid: true, events };
      }
    }
    // the slide visited slideCells extra cells: pop the tail once per
    // extra cell so the body stretches along the path
    for (let i = 0; i < slideCells; i++) ns.worm.pop();
    if (slideCells > 0) {
      events.push({ type: "slide", dir, cells: slideCells });
    }
    // re-position head bookkeeping done; fall through to apple/exit logic
    // with the FINAL head cell
    const headPos = ns.worm[0];
    // apple at the landing cell (apples never sit on ice — engine-safe)
    const aIdx = ns.apples.findIndex((p) => p.x === headPos.x && p.y === headPos.y);
    if (aIdx >= 0) {
      ns.apples.splice(aIdx, 1);
      events.push({ type: "ate", at: { ...headPos }, newLength: ns.worm.length });
      events.push({ type: "grow", newLength: ns.worm.length });
    } else {
      ns.worm.pop(); // no apple: a slide of n+1 head-cells still moves n+1 body cells
    }
    ns.turn += 1;
    const ps2 = platesSatisfied(ns);
    if (ps2.total > 0) events.push({ type: "plates", ...ps2 });
    touchBridges(ns);
    crumblePass(ns, events);
    const finalTerr = ns.terrain[headPos.y][headPos.x];
    if (finalTerr === "X") {
      if (ns.apples.length === 0) {
        ns.status = "won";
        events.push({ type: "win", at: { ...headPos }, moves: ns.turn });
      } else {
        events.push({ type: "exit-sealed", applesLeft: ns.apples.length });
      }
    }
    ns.lastEvents = events;
    if (ns.turn >= ns.turnLimit && ns.status === "playing") ns.status = "exhausted";
    return { state: ns, valid: true, events };
  }

  // ── ordinary single-cell move ──────────────────────────────────────
  const headNow = ns.worm[0];

  // key pickup
  const keyIdx = ns.keys.findIndex((p) => p.x === headNow.x && p.y === headNow.y);
  if (keyIdx >= 0) {
    ns.keys.splice(keyIdx, 1);
    ns.keysHeld += 1;
    events.push({ type: "key", at: { ...headNow }, held: ns.keysHeld });
  }

  const appleIdx = ns.apples.findIndex((p) => p.x === headNow.x && p.y === headNow.y);
  if (appleIdx >= 0) {
    ns.apples.splice(appleIdx, 1);
    // grow: do NOT pop the tail
    events.push({ type: "move", dir });
    events.push({ type: "ate", at: { ...headNow }, newLength: ns.worm.length });
    events.push({ type: "grow", newLength: ns.worm.length });
  } else {
    ns.worm.pop();
    events.push({ type: "move", dir });
  }

  ns.turn += 1;
  const ps = platesSatisfied(ns);
  if (ps.total > 0) events.push({ type: "plates", ...ps });

  if (terr === "X") {
    if (ns.apples.length === 0) {
      ns.status = "won";
      events.push({ type: "win", at: { x: nx, y: ny }, moves: ns.turn });
    } else {
      events.push({ type: "exit-sealed", applesLeft: ns.apples.length });
    }
  }

  touchBridges(ns);
  crumblePass(ns, events);

  ns.lastEvents = events;
  if (ns.turn >= ns.turnLimit && ns.status === "playing") ns.status = "exhausted";
  return { state: ns, valid: true, events };
}

/** Re-apply an action sequence to a fresh game — used by the Checker. */
export function replay(level: LevelDef, actions: Action[]): {
  final: GameState;
  ok: boolean;
  error?: string;
} {
  let s = createGame(level);
  for (let i = 0; i < actions.length; i++) {
    const r = step(s, actions[i]);
    if (!r.valid) return { final: s, ok: false, error: `step ${i}: ${r.reason}` };
    s = r.state;
    if (s.status !== "playing" && i < actions.length - 1) {
      return { final: s, ok: false, error: `step ${i}: game ended early (${s.status})` };
    }
  }
  return { final: s, ok: true };
}

export { posEq, posKey };
