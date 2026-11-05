// Dump the certified optimal line for a nightmare draft — prints each
// turn's action + head position + key events, so level design can be
// reasoned about from the REAL line.
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame, step } from "../src/lib/wyrm/engine";
import type { LevelDef } from "../src/lib/wyrm/types";

const DIR = path.join(process.cwd(), "scripts", "nightmare");
const stem = process.argv[2];
const raw = readFileSync(path.join(DIR, stem + ".txt"), "utf8");
const lines = raw.split("\n");
const name = /^name:\s*(.+)$/.exec(lines[0])![1];
const slug = /^slug:\s*(.+)$/.exec(lines[1])![1];
const turnLimit = parseInt(/^turnLimit:\s*(\d+)$/.exec(lines[2])![1], 10);
const grid = lines.slice(3).filter((l) => l.length > 0);
const level: LevelDef = { name, slug, grid, turnLimit };

const r = validateLevel(level);
if (!r.solvable) {
  console.log(`UNSOLVABLE: ${r.reason} (states=${r.statesExplored})`);
  process.exit(0);
}
console.log(`${slug}: par=${r.minMoves} states=${r.statesExplored} diff=${(r as any).difficulty} tier=${(r as any).tier}`);
let s = createGame(level);
const ACTIONS: any[] = ["up", "down", "left", "right", "split"];
r.solution.forEach((a, i) => {
  const res = step(s, a);
  s = res.state;
  const h = s.worm[0];
  const evts = res.events.map((e) => e.type).filter((t) => t !== "move").join(",");
  console.log(
    String(i + 1).padStart(3),
    a.padEnd(5),
    `(${h.x},${h.y})`.padEnd(7),
    `len=${s.worm.length}`,
    evts,
  );
});
