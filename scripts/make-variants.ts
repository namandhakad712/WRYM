// ── WYRM.LAB · mirror-variant certifier ──────────────────────────────
// Lesson from LMGame-Bench (arXiv:2505.15146) and BALROG's procedurally
// generated environments: static benchmarks leak into training data.
// Their answer is procedural generation; ours is deterministic variation
// — every ladder level gets a certified MIRROR TWIN (vertical flip,
// valves remapped ^↔v), solvable by the same optimal-length line.
//
// A model that memorized the original but cannot reason will fail its
// twin; a model that solved both actually played. Run any model against
// the twin set by pointing the runner at the variant grids — the parity
// (same par, same difficulty family) is pre-certified here and archived
// in results/variants.json.
//
// Usage: bun scripts/make-variants.ts

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import type { LevelDef } from "../src/lib/wyrm/types";

const ROOT = path.resolve((import.meta as any).dir, "..");
const OUT = path.join(ROOT, "results", "variants.json");

/** Vertical mirror: rows reversed, vertical valve arrows swapped.
 *  The initial worm stays horizontal with its head at the right end
 *  (the parser's invariant), gravity does not exist in this game, and
 *  every mechanic is direction-symmetric once valves are remapped —
 *  so the mirrored solution has EXACTLY the same move count. */
function mirrorGrid(grid: string[]): string[] {
  const swap = (c: string) => (c === "^" ? "v" : c === "v" ? "^" : c);
  return [...grid].reverse().map((row) => row.split("").map(swap).join(""));
}

const levels: unknown[] = [];
let certified = 0;
let parityBroken = 0;

for (const lv of HANDCRAFTED_LEVELS) {
  const base = validateLevel(lv);
  const twin: LevelDef = { name: `${lv.name} (mirror)`, slug: `${lv.slug}-mirror`, grid: mirrorGrid(lv.grid), turnLimit: lv.turnLimit };
  const report = validateLevel(twin);

  const parity = base.solvable && report.solvable ? report.minMoves === base.minMoves : false;
  if (report.solvable && parity) certified++;
  if (report.solvable && !parity) parityBroken++;

  levels.push({
    slug: twin.slug,
    base: lv.slug,
    grid: twin.grid,
    turnLimit: twin.turnLimit ?? 120,
    solvable: report.solvable,
    minMoves: report.minMoves,
    baseMinMoves: base.minMoves,
    parity,
    statesExplored: report.statesExplored,
    difficulty: report.difficulty,
    tier: report.tier,
    dims: report.dims,
  });

  console.log(
    `${report.solvable && parity ? "✓" : "✗"} ${twin.slug.padEnd(28)} solvable=${report.solvable}` +
      ` par ${report.minMoves} (base ${base.minMoves}) states ${report.statesExplored}` +
      ` difficulty ${report.difficulty} tier ${report.tier}`,
  );
}

const doc = {
  schema: "wyrm.variants/1",
  generatedAt: new Date().toISOString(),
  method: "vertical-mirror, valve remap ^↔v — deterministic, contamination-check variants",
  purpose:
    "Certified twins of every ladder level. Run any model on the twin set to test reasoning vs memorization; identical par guarantees comparable scoring.",
  certified,
  total: HANDCRAFTED_LEVELS.length,
  levels,
};

writeFileSync(OUT, JSON.stringify(doc, null, 2));
console.log(
  `\nvariants certified: ${certified}/${HANDCRAFTED_LEVELS.length}` +
    (parityBroken ? ` (⚠ ${parityBroken} parity mismatches — inspect!)` : " — full par parity") +
    ` → ${path.relative(ROOT, OUT)}`,
);
