// ── WYRM.LAB · mirror-variant certifier ──────────────────────────────
// Lesson from LMGame-Bench (arXiv:2505.15146) and BALROG's procedurally
// generated environments: static benchmarks leak into training data.
// Their answer is procedural generation; ours is deterministic variation
// — every ladder level gets a certified MIRROR TWIN (horizontal flip,
// valves remapped <↔>), solvable by the same optimal-length line.
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
import { validateLevel, clearValidationCache } from "../src/lib/wyrm/validator";
import type { LevelDef } from "../src/lib/wyrm/types";

const ROOT = path.resolve((import.meta as any).dir, "..");
const OUT = path.join(ROOT, "results", "variants.json");

/** Horizontal mirror: columns reversed, horizontal valve arrows swapped.
 *  v4 note: the twin MUST be a horizontal (left↔right) mirror, not a
 *  vertical one — EGGS obey gravity (support = the cell directly
 *  south), and a vertical flip would leave every egg floating. The
 *  horizontal mirror preserves the south direction, remaps <↔>, and
 *  leaves ^/v untouched; the worm comes out facing LEFT (`@oo`), which
 *  the parser accepts since v4. Every mechanic is direction-symmetric
 *  once valves are remapped — so the mirrored solution has EXACTLY the
 *  same move count. */
function mirrorGrid(grid: string[]): string[] {
  const swap = (c: string) => (c === "<" ? ">" : c === ">" ? "<" : c);
  return grid.map((row) => [...row].reverse().map(swap).join(""));
}

const levels: unknown[] = [];
let certified = 0;
let parityBroken = 0;

for (const lv of HANDCRAFTED_LEVELS) {
  const base = validateLevel(lv);
  const twin: LevelDef = { name: `${lv.name} (mirror)`, slug: `${lv.slug}-mirror`, grid: mirrorGrid(lv.grid), turnLimit: lv.turnLimit };
  const report = validateLevel(twin);
  // the certification cache holds a full BFS tree per level — 38 levels
  // plus twins in one process is an OOM. Release each tree as we go
  // and force a major GC so the next 300k-state rink starts from zero.
  clearValidationCache();
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  }

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
  method: "horizontal-mirror, valve remap <↔>, gravity preserved (v4: eggs) — deterministic, contamination-check variants",
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
