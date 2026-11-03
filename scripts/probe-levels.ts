// Per-level timing probe to find the state-space explosion.
const slugs = (process.argv.slice(2).length ? process.argv.slice(2) : ["07-key-note", "08-slippery-slope", "09-no-return", "10-burnt-bridges", "11-cold-ledger", "12-wyrm-trial"]);
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";

for (const slug of slugs) {
  const lv = HANDCRAFTED_LEVELS.find((l) => l.slug === slug);
  if (!lv) continue;
  const t0 = Date.now();
  const r = validateLevel(lv);
  console.log(
    `${slug.padEnd(18)} solvable=${r.solvable} d=${r.difficulty} min=${r.minMoves} states=${r.statesExplored} ${Date.now() - t0}ms ${r.reason ?? ""}`,
  );
}
