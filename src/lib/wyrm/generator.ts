// ── WYRM.LAB · procedural level generator ───────────────────────────
// Random layout synthesis + hard validation filter (BFS). Only levels
// that the Logic Validator certifies solvable (and interesting) survive.

import { LevelDef, ValidatorReport } from "./types";
import { validateLevel } from "./validator";
import { CHARS } from "./engine";

export interface GeneratedLevel {
  level: LevelDef;
  report: ValidatorReport;
  attempts: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GenOpts {
  width?: number;
  height?: number;
  minMoves?: [number, number];
  difficulty?: [number, number];
  features?: {
    apples?: [number, number];
    crates?: [number, number];
    plates?: [number, number];
    doors?: [number, number];
    spikes?: [number, number];
  };
}

const ri = (rnd: () => number, min: number, max: number) =>
  min + Math.floor(rnd() * (max - min + 1));

function attempt(rnd: () => number, opts: GenOpts): LevelDef {
  const w = opts.width ?? ri(rnd, 8, 11);
  const h = opts.height ?? ri(rnd, 7, 9);
  const f = opts.features ?? {};

  // grid of floor, walls around
  const grid: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? CHARS.wall : CHARS.floor);
    grid.push(row);
  }

  const floorCells: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) floorCells.push({ x, y });

  const take = (): { x: number; y: number } | undefined => {
    if (floorCells.length === 0) return undefined;
    const i = Math.floor(rnd() * floorCells.length);
    return floorCells.splice(i, 1)[0];
  };

  // a few random interior walls for texture (avoid fully sealed pockets
  // — the validator will reject bad geometry anyway)
  const wallCount = ri(rnd, 0, Math.floor((w * h) / 14));
  for (let i = 0; i < wallCount; i++) {
    const c = take();
    if (c) grid[c.y][c.x] = CHARS.wall;
  }

  // worm: horizontal, head at right end
  const wormLen = ri(rnd, 2, 3);
  const wy = ri(rnd, 1, h - 2);
  let wx = ri(rnd, wormLen, w - 2); // head x
  for (let i = 0; i < wormLen; i++) {
    const x = wx - i;
    if (x < 1) { wx += 1; i = -1; continue; } // nudge right, restart
    grid[wy][x] = i === 0 ? CHARS.head : CHARS.body;
  }
  // remove worm cells from floor pool
  for (let i = 0; i < wormLen; i++) {
    const idx = floorCells.findIndex((c) => c.x === wx - i && c.y === wy);
    if (idx >= 0) floorCells.splice(idx, 1);
  }

  const place = (ch: string): { x: number; y: number } | undefined => {
    const c = take();
    if (!c) return undefined;
    grid[c.y][c.x] = ch;
    return c;
  };

  const apples = ri(rnd, ...(f.apples ?? [1, 2]));
  for (let i = 0; i < apples; i++) place(CHARS.apple);
  const crates = ri(rnd, ...(f.crates ?? [0, 1]));
  for (let i = 0; i < crates; i++) place(CHARS.crate);
  const plates = ri(rnd, ...(f.plates ?? [0, 1]));
  for (let i = 0; i < plates; i++) place(CHARS.plate);
  const doors = plates > 0 ? ri(rnd, ...(f.doors ?? [0, 1])) : 0;
  for (let i = 0; i < doors; i++) place(CHARS.door);
  const spikes = ri(rnd, ...(f.spikes ?? [0, 4]));
  for (let i = 0; i < spikes; i++) place(CHARS.spike);

  const exit = take();
  if (exit) grid[exit.y][exit.x] = CHARS.exit;

  return {
    name: `Proc ${w}x${h}`,
    slug: "",
    grid: grid.map((r) => r.join("")),
  };
}

/** Generate one validated level. Throws if no acceptable level found. */
export function generateLevel(seed: number, opts: GenOpts = {}, maxAttempts = 400): GeneratedLevel {
  const rnd = mulberry32(seed);
  const [minM, maxM] = opts.minMoves ?? [7, 45];
  const [minD, maxD] = opts.difficulty ?? [2, 9];

  for (let i = 0; i < maxAttempts; i++) {
    let level: LevelDef;
    try {
      level = attempt(rnd, opts);
    } catch {
      continue;
    }
    let report: ValidatorReport;
    try {
      report = validateLevel(level);
    } catch {
      continue;
    }
    if (
      report.solvable &&
      report.minMoves >= minM &&
      report.minMoves <= maxM &&
      report.difficulty >= minD &&
      report.difficulty <= maxD
    ) {
      level.slug = `proc-${seed}-${i}`;
      level.name = pickName(rnd, report);
      return { level, report, attempts: i + 1 };
    }
  }
  throw new Error(`generator: no acceptable level in ${maxAttempts} attempts (seed ${seed})`);
}

const NAME_A = ["Mossy", "Copper", "Silent", "Broken", "Neon", "Hollow", "Amber", "Rusty", "Deep", "Sly", "Crimson", "Pale", "Wild", "Iron", "Last"];
const NAME_B = ["Cellar", "Vault", "Garden", "Ridge", "Run", "Chamber", "Nest", "Loop", "Gate", "Crossing", "Den", "Pit", "Walk", "Hollow", "Trek"];

function pickName(rnd: () => number, r: ValidatorReport): string {
  const a = NAME_A[Math.floor(rnd() * NAME_A.length)];
  const b = NAME_B[Math.floor(rnd() * NAME_B.length)];
  if (r.splitsRequired) return `${a} Severance`;
  if (r.crates > 0) return `${a} ${b}`;
  return `${a} ${b}`;
}
