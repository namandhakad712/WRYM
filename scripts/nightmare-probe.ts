// ── WRYM · nightmare draft prober ─────────────────────────────────────
// Iterates on Tier-V level drafts stored as text files in
// scripts/nightmare/*.txt before they are baked into levels.ts.
//
// File format:
//   name: The Reliquary
//   slug: 27-the-reliquary
//   turnLimit: 53
//   <grid rows...>
//
// Usage: bun scripts/nightmare-probe.ts [file-stems...]

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateLevel } from "../src/lib/wyrm/validator";
import type { LevelDef } from "../src/lib/wyrm/types";

const DIR = path.join(process.cwd(), "scripts", "nightmare");
const want = process.argv.slice(2);
const files = readdirSync(DIR).filter((f) => f.endsWith(".txt"))
  .filter((f) => want.length === 0 || want.some((w) => f.startsWith(w)));

for (const f of files) {
  const raw = readFileSync(path.join(DIR, f), "utf8");
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""));
  const name = /^name:\s*(.+)$/.exec(lines[0])?.[1] ?? f;
  const slug = /^slug:\s*(.+)$/.exec(lines[1])?.[1] ?? f.replace(".txt", "");
  const turnLimit = parseInt(/^turnLimit:\s*(\d+)$/.exec(lines[2])?.[1] ?? "120", 10);
  const grid = lines.slice(3).filter((l) => l.length > 0);
  const level: LevelDef = { name, slug, grid, turnLimit };

  const w = grid[0]?.length ?? 0;
  const ragged = grid.some((r) => r.length !== w);
  const t0 = Date.now();
  const r = validateLevel(level);
  const dt = Date.now() - t0;

  const line = [
    f.replace(".txt", "").padEnd(22),
    ragged ? "RAGGED!" : `solvable=${String(r.solvable).padEnd(5)}`,
    `diff=${(r as any).difficulty ?? 0}`,
    `tier=${(r as any).tier ?? "-"}`,
    `min=${r.minMoves}`,
    `states=${r.statesExplored}`,
    `splits=${String(r.splitsRequired).padEnd(5)}`,
    `${dt}ms`,
    r.reason ?? "",
  ].join(" ");
  console.log(line);
  if (r.solvable) {
    const d = (r as any).dims ?? {};
    const ev = (r as any).evidence ?? {};
    console.log(
      `    depth=${(d.depth ?? 0).toFixed(0)} search=${(d.search ?? 0).toFixed(0)} irrev=${(d.irreversibility ?? 0).toFixed(0)} sim=${(d.simulation ?? 0).toFixed(0)} threat=${(d.threat ?? 0).toFixed(0)} chor=${(d.choreography ?? 0).toFixed(0)} budget=${(d.budget ?? 0).toFixed(0)}  | digs=${ev.digs} pushes=${ev.pushes} unlocks=${ev.unlocks} valves=${ev.valveEntries} burned=${ev.bridgesBurned} splits=${ev.splits} slides=${ev.slides}/${ev.slideCells} fatal=${ev.fatalMoves}/${ev.legalMoves}`,
    );
  }
}
