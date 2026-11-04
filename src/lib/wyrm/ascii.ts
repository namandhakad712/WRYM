// ── WYRM.LAB · ASCII rendering & observation builder v3 ─────────────
// This module produces the EXACT text an AI model receives:
//  · renderAscii()        — the board as text (raw, 1 char per cell)
//  · renderAsciiFramed()  — same board with coordinate rulers
//  · buildObservation()   — the full observation (mission + framed grid +
//                           status + perception + history) for the Thinker
// The observation is the ONLY channel through which an agent may learn
// about the game — strict information isolation (see lib/wyrm/sandbox.ts).

import { GameState, Action } from "./types";
import { CHARS, doorsOpen, platesSatisfied } from "./engine";

/** Render the live board as ASCII (what the AI sees). */
export function renderAscii(s: GameState): string {
  const rows: string[][] = s.terrain.map((r) => [...r]);
  s.apples.forEach((p) => (rows[p.y][p.x] = CHARS.apple));
  s.crates.forEach((p) => (rows[p.y][p.x] = CHARS.crate));
  s.keys.forEach((p) => (rows[p.y][p.x] = CHARS.key));
  s.remains.forEach((p) => (rows[p.y][p.x] = CHARS.remain));
  s.worm.forEach((p, i) => (rows[p.y][p.x] = i === 0 ? CHARS.head : CHARS.body));
  return rows.map((r) => r.join("")).join("\n");
}

/** The same board with explicit coordinate rulers.
 *  Rows are numbered top→bottom, columns left→right, origin (0,0) at the
 *  top-left. Two ruler lines when the grid is wider than 10 columns. */
export function renderAsciiFramed(s: GameState): string {
  const board = renderAscii(s);
  const width = s.terrain[0]?.length ?? 0;
  const pad = String(s.terrain.length - 1).length + 1; // row gutter
  const gutter = " ".repeat(pad);
  const ones = gutter + Array.from({ length: width }, (_, i) => String(i % 10)).join("");
  const lines = [ones];
  if (width > 10) {
    const tens = gutter + Array.from({ length: width }, (_, i) => (i >= 10 ? String(Math.floor(i / 10)) : " ")).join("");
    lines.unshift(tens);
  }
  board.split("\n").forEach((row, y) => lines.push(String(y).padStart(pad - 1) + " " + row));
  return lines.join("\n");
}

export const LEGEND_TEXT = `LEGEND (one character = one cell):
  #  wall (impassable; also what a crumbled bridge becomes)
  .  floor
  +  dirt (soft earth — you can dig through it; it crumbles away permanently)
  @  worm head (you)
  o  worm body segment (solid — you cannot cross it)
  :  inert remains (solid — dropped worm halves; they never move)
  *  apple (eat ALL to unseal the exit; each apple grows you by 1)
  $  crate (pushable; weighs down plates; cannot be pushed into dirt or ice)
  %  pressure plate (weighed down by crate / remains / worm segment)
  D  door (blocks entry while ANY plate is unweighted)
  X  exit (reach it with the head AFTER eating all apples to WIN)
  ~  spikes (touching them kills you instantly)
  > < ^ v  one-way valve (you may ENTER this tile ONLY moving in the
     arrow's direction; standing on it and leaving is always free)
  =  crumble bridge (holds while occupied; once the last weight leaves
     the tile it collapses into impassable rubble # — crossing is final)
  _  ice (frictionless: entering it starts a SLIDE — you keep moving in
     the same direction until your head reaches a non-ice cell or is
     stopped; sliding into spikes kills; slides cannot dig or push)
  k  key (walk over it to pick it up)
  L  lock (impassable until you carry a key; entering it consumes one
     key and opens it permanently)`;

export const RULES_TEXT = `RULES:
  1. One action per turn: up / down / left / right / split.
  2. The worm head moves 1 cell; body segments follow.
  3. Walls, closed doors, locked tiles, wrong-way valves, crates you
     cannot push, your own body and remains block movement (except your
     tail cell, which is legal).
  4. Push crates by walking into them (sokoban style). Crates cannot
     be pushed into dirt, ice, locks or through other entities.
  5. Doors open ONLY while every plate (%) carries weight.
  5b. DIRT (+) is soft: moving into a dirt cell digs through it — the
     dirt is consumed and the cell becomes open floor. Digging is a
     normal move (no extra cost) but it permanently reshapes the maze.
  6. SPLIT cuts you in half: you keep the front half with the head,
     the back half becomes inert remains (:) that stay forever and
     weigh down plates. You cannot split a 1-segment worm.
  7. Win: head on X with zero apples left. Spikes = instant death.
  8. The grid is given with row 0 at the TOP, column 0 at the LEFT.
     Moving "up" decreases the row number, "right" increases the column.
  9. ICE (_): a slide covers MANY cells but costs ONE turn. Simulate
     the full glide before choosing a direction — where you STOP
     matters, not where you step. Ice never holds apples.
  10. BRIDGES (=) are one-way in time: after you leave a bridge tile
     it collapses to #. You can never re-cross it. Remains or crates
     left on a bridge keep it standing.
  11. KEYS (k) stack; each lock (L) eats exactly one key and opens
     forever. You may carry more keys than you need.`;

export interface ObservationOpts {
  history?: { action: Action; valid: boolean; note?: string }[];
  invalidReason?: string;
  coachHint?: string;
  attempt?: number;
}

/** The full text observation for the Thinker at a given state. */
export function buildObservation(s: GameState, opts: ObservationOpts = {}): string {
  const ps = platesSatisfied(s);
  const head = s.worm[0];
  const exit = findExit(s);
  const applesLeft = s.apples.length;
  const limit = s.turnLimit;

  const mission =
    `MISSION: ${applesLeft > 0 ? `eat ${applesLeft} apple${applesLeft > 1 ? "s" : ""} (${s.apples.map((a) => `(${a.y},${a.x})`).join(" ")}), then` : "all apples eaten —"} reach the exit${exit ? ` X at (${exit.y},${exit.x})` : ""} with the head.`;

  const statusLine = [
    `turn ${s.turn}/${limit} (${limit - s.turn} left)`,
    `head (${head.y},${head.x}) · length ${s.worm.length}`,
    `keys held ${s.keysHeld}`,
    ps.total > 0 ? `plates ${ps.satisfied}/${ps.total} weighted` : null,
    ps.total > 0 ? `door ${doorsOpen(s) ? "OPEN" : "CLOSED"}` : null,
    `status ${s.status.toUpperCase()}`,
  ]
    .filter(Boolean)
    .join(" | ");

  // perception: what is under/around the head right now (facts only —
  // no planning hints; the model must do its own forward simulation)
  const perception = perceive(s);
  const parts: string[] = [];
  parts.push(mission);
  parts.push("");
  parts.push(`CURRENT BOARD (row r, column c — origin (0,0) top-left; @ = your head):`);
  parts.push(renderAsciiFramed(s));
  parts.push("");
  parts.push(`STATUS: ${statusLine}`);
  if (perception.length) parts.push(`PERCEPTION: ${perception.join(" · ")}`);

  if (opts.invalidReason) {
    parts.push("");
    parts.push(`YOUR LAST ACTION WAS REJECTED: ${opts.invalidReason}. Choose a different action.`);
  }

  if (opts.history && opts.history.length > 0) {
    const last = opts.history.slice(-8);
    parts.push("");
    parts.push(
      "RECENT HISTORY (oldest first): " +
        last
          .map((h) => `${h.action}${h.valid ? "" : ` (invalid: ${h.note ?? "?"})`}`)
          .join(", "),
    );
  }

  if (opts.coachHint) {
    parts.push("");
    parts.push(`COACH NOTE: ${opts.coachHint}`);
  }

  return parts.join("\n");
}

function findExit(s: GameState): { x: number; y: number } | null {
  for (let y = 0; y < s.terrain.length; y++) {
    const x = s.terrain[y].indexOf("X" as never);
    if (x >= 0) return { x, y };
  }
  return null;
}

/** Bare facts about the head's immediate surroundings. */
function perceive(s: GameState): string[] {
  const out: string[] = [];
  const h = s.worm[0];
  const t = s.terrain[h.y]?.[h.x];
  if (t === "_") out.push("you are ON ice — moving starts a slide");
  if (t === "=") out.push("you are ON a crumble bridge — leaving collapses it forever");
  if (t === "%" ) out.push("you are ON a pressure plate");
  const dirs: [string, number, number][] = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];
  for (const [name, dx, dy] of dirs) {
    const nx = h.x + dx, ny = h.y + dy;
    const nt = s.terrain[ny]?.[nx];
    if (nt === "~") out.push(`spikes ${name} at (${ny},${nx})`);
    if (nt === "_" ) out.push(`ice ${name} at (${ny},${nx})`);
    if (nt === "=" ) out.push(`bridge ${name} at (${ny},${nx})`);
    if (nt === "L") out.push(`lock ${name} at (${ny},${nx})`);
    if (nt === "D") out.push(`door ${name} at (${ny},${nx})`);
  }
  return out;
}

/** System prompt for the Thinker — the structured instructions (v3). */
export function thinkerSystemPrompt(): string {
  return `You are WYRM-SOLVER, an expert deterministic-puzzle agent playing "WYRM". You see the board as framed ASCII text with coordinates and must choose exactly ONE action per turn. You never act on instinct: every action you emit is the result of an explicit, checkable reasoning step.

${LEGEND_TEXT}

${RULES_TEXT}

TURN PROTOCOL — execute these five steps EVERY turn, in order, and show your work inside "thought":
  1. LOCATE — find @ on the board. State its (row, col) and the cells of your body.
  2. SURVEY — list what matters within reach: remaining apples, the exit, spikes,
     ice lanes, valves, bridges, plates and the door, keys and locks. Name cells
     as (row, col) pairs.
  3. VERIFY — take your candidate action and simulate it ONE full step on the
     board: where exactly does the head land? Does it push a crate, dig dirt,
     cross a valve, burn a bridge, pick a key? If it enters ice, trace the
     ENTIRE glide to its stop cell before accepting it.
  4. CHECK FUTURES — if the move is irreversible (valve entry, bridge crossing,
     digging, splitting, spending a key), prove you can still finish: every
     remaining apple reachable, exit reachable, and turns_left >= the distance
     you still must travel. If you cannot prove it, do not move.
  5. COMMIT — emit the JSON. The action must be legal THIS turn.

FAILURE CATALOGUE — the ten classic ways agents die or strand in WYRM.
  Check yourself against the relevant ones before committing:
  1. SLIDE-BLINDNESS: stepping onto ice without tracing the glide to its stop
     cell. The step cell is irrelevant; only the STOP cell matters.
  2. CORNER-PUSH: pushing a crate into a wall corner or against dirt/ice —
     it is stuck forever and the plate it was meant for stays unweighted.
  3. PREMATURE SPLIT: splitting before you know what the dropped half must
     weigh down. A split cannot be undone; the remains never move again.
  4. BRIDGE BURN: crossing a bridge you will need again — including the
     return trip to the exit or a distant apple.
  5. VALVE LOCKOUT: entering a one-way valve before verifying the far side
     still connects to everything you still need.
  6. APPLE AMNESIA: reaching the exit while apples remain — no win. Always
     re-count the apples left before your final approach.
  7. TAIL BLINDNESS: forgetting your own body blocks you. Long worms need
     loops; check where your tail will be, not just your head.
  8. KEY WASTE: burning a key on a lock that leads nowhere while another
     lock stands between you and the exit.
  9. PLATE ABANDONMENT: a door is open ONLY while every plate is weighted.
     If the weight that holds a plate must move away, the door slams shut.
  10. BUDGET BLOWOUT: wandering until the turn limit hits. Compare the
     length of your intended route with turns_left before you start it.

PLANNING DOCTRINE:
  - Think in sub-goals, ordered by dependency: what must be weighted or
    unlocked BEFORE what. Doors and plates usually precede distant apples.
  - Write coordinates, not vibes: "go to (6,3), push crate up twice" is a
    executable plan; "head toward the door" is not.
  - When two moves look equal, prefer the one that keeps more of the board
    reachable (no burns, no lockouts, no dead ends).
  - If the position confuses you, re-derive the plan from the FULL board
    instead of oscillating between two cells — oscillation burns the budget.
  - Efficiency matters: the benchmark scores you on moves used vs par.

OUTPUT CONTRACT — reply with ONE JSON object and nothing else:
{"thought": "<your 5-step protocol execution: locate, survey, verify, futures, commit>", "action": "<up|down|left|right|split>"}`;
}

/** System prompt for the Reviewer. */
export function reviewerSystemPrompt(): string {
  return `You are WYRM-REVIEWER, a strict game-play analyst. You receive the full action log of a WYRM puzzle run and must critique the agent's play: planning quality, spatial reasoning, rule understanding, efficiency, and mistakes.

Reply with ONE JSON object and nothing else:
{"rating": <1-10 integer>, "summary": "<2-3 sentence verdict>",
 "strengths": ["..."], "weaknesses": ["..."],
 "suggestions": ["<concrete advice for the next attempt>"]}`;
}

/** System prompt for the New Level Thinker (level generator). */
export function levelDesignerSystemPrompt(): string {
  return `You are WYRM-ARCHITECT, a puzzle level designer for the grid game WYRM.

${LEGEND_TEXT}

${RULES_TEXT}

DESIGN REQUIREMENTS:
  - Grid between 7x7 and 13x11 (rows x cols), fully enclosed by walls.
  - Exactly ONE exit X. One worm: head @ with body o's stretching to
    its LEFT on the same row (it starts facing right).
  - Classic elements: 0-2 apples, 0-1 crates, 0-3 plates, 0-2 doors,
    0-6 spikes, 0-4 dirt.
  - Advanced elements (optional, at most two families per level):
    0-4 valves, 0-3 bridges, 0-4 ice tiles, 0-1 keys with 0-1 locks.
  - Every cell character must be from the legend; all rows equal width.
  - The level MUST be solvable — mentally simulate a solution before
    answering. Prefer levels that need a clever trick: a split, a
    drape over a plate, a crate push, an ice landing, a valve loop,
    or careful spike threading.
  - Difficulty target: tier ADVANCED to GAUNTLET (index 5.0–8.0 on the
    v3 scale — depth + irreversibility + threat, not decoration).

Reply with ONE JSON object and nothing else:
{"name": "<two-word level name>", "thought": "<design reasoning + sketched solution>",
 "grid": ["<row 0>", "<row 1>", "..."]}`;
}
