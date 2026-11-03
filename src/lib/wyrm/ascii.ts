// ── WYRM.LAB · ASCII rendering & observation builder v2 ─────────────
// This module produces the EXACT text an AI model receives:
//  · renderAscii()        — the board as text
//  · buildObservation()   — the full observation string (rules + grid +
//                           status + history) sent to the Thinker
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

export const LEGEND_TEXT = `LEGEND:
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
}

/** The full text observation for the Thinker at a given state. */
export function buildObservation(s: GameState, opts: ObservationOpts = {}): string {
  const ps = platesSatisfied(s);
  const statusLine = [
    `turn: ${s.turn} (limit ${s.turnLimit})`,
    `length: ${s.worm.length}`,
    `apples left: ${s.apples.length}`,
    `keys held: ${s.keysHeld}`,
    ps.total > 0 ? `plates weighted: ${ps.satisfied}/${ps.total}` : null,
    `door: ${doorsOpen(s) ? "OPEN" : "CLOSED"}`,
    `status: ${s.status.toUpperCase()}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const parts: string[] = [];
  parts.push("CURRENT BOARD:");
  parts.push(renderAscii(s));
  parts.push("");
  parts.push(`STATUS: ${statusLine}`);

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

/** System prompt for the Thinker — the structured instructions. */
export function thinkerSystemPrompt(): string {
  return `You are WYRM-SOLVER, an expert puzzle agent playing "WYRM", a deterministic grid puzzle game. You see the board as ASCII text and must choose exactly one action per turn.

${LEGEND_TEXT}

${RULES_TEXT}

STRATEGY GUIDE:
  - Plan several moves ahead; the worm cannot reverse into itself, so
    long bodies need room to loop around.
  - Apples are MANDATORY (the exit stays sealed without them) but they
    make you longer and clumsier.
  - Crates open doors via plates. Sometimes the only weight available
    is your own body: drape yourself over a plate, or SPLIT so the
    dropped half keeps the plate pressed forever.
  - Dirt (+) is a resource: dig tunnels that shorten your loops, or
    carve an escape route — but remember the maze you dig is the maze
    you keep for the rest of the run.
  - ICE (_): before stepping onto ice, trace the ENTIRE glide — your
    head stops at the first non-ice cell or obstacle. A slide can carry
    you past apples, into spikes, or strand you in a corner. Plan the
    landing cell, not the step.
  - VALVES (> < ^ v) make paths one-way. If you cross one, verify you
    can still loop back around to any apple or the exit BEFORE moving.
  - BRIDGES (=) burn behind you. Never cross a bridge you might need
    again — including for the return trip to the exit.
  - KEYS: check how many locks (L) stand between you and the exit and
    gather that many keys first; a key consumed on a dead-end lock is
    wasted unless another exists.
  - Spikes punish sloppy pathing. Death ends the attempt.
  - The turn limit is real: plan a route whose total length fits.

OUTPUT FORMAT — reply with ONE JSON object and nothing else:
{"thought": "<your reasoning about the position and your plan>", "action": "<up|down|left|right|split>"}`;
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
  - Difficulty target: 4-8 out of 10.

Reply with ONE JSON object and nothing else:
{"name": "<two-word level name>", "thought": "<design reasoning + sketched solution>",
 "grid": ["<row 0>", "<row 1>", "..."]}`;
}
