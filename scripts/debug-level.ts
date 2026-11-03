// Debug: run phase-1 BFS with a big cap on one level to see if it's solvable.
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { createGame, step } from "../src/lib/wyrm/engine";
import { stateKey } from "../src/lib/wyrm/validator";
import type { Action, GameState, LevelDef } from "../src/lib/wyrm/types";

const slug = process.argv[2] ?? "15-cathedral-rust";
const cap = Number(process.argv[3] ?? 3_000_000);
const lv: LevelDef = HANDCRAFTED_LEVELS.find((l) => l.slug === slug)!;
console.log(`debug ${slug} cap=${cap}`);

const start = createGame(lv);
const seen = new Set<string>([stateKey(start)]);
let queue: GameState[] = [start];
let explored = 0;
let depth = 0;
let won = false;

while (queue.length && explored < cap) {
  const next: GameState[] = [];
  for (const s of queue) {
    explored++;
    if (s.status === "won") { won = true; break; }
    for (const a of ["up", "down", "left", "right"] as Action[]) {
      const r = step(s, a);
      if (!r.valid || r.state.status === "dead") continue;
      const k = stateKey(r.state);
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(r.state);
    }
  }
  if (won) break;
  queue = next;
  depth++;
  if (depth % 10 === 0) console.log(`  depth ${depth}: explored ${explored}, frontier ${queue.length}`);
}
console.log(won ? `WON at depth ${depth} (moves≈${depth}), explored ${explored}` : `NOT WON — explored ${explored}, frontier ${queue.length}`);
