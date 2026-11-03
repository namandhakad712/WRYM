// Validate the full ladder (with the new Tier III gauntlet levels).
// Usage: bun scripts/validate-tier3.ts [slug ...]
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame } from "../src/lib/wyrm/engine";

const filter = process.argv.slice(2);
let failed = 0;

for (const lv of HANDCRAFTED_LEVELS) {
  if (filter.length && !filter.some((f) => lv.slug.includes(f))) continue;
  const t0 = Date.now();
  let report;
  try {
    const g = createGame(lv); // throws on malformed grid
    void g;
    report = validateLevel(lv);
  } catch (e) {
    console.log(`✗ ${lv.slug.padEnd(20)} FORMAT ERROR: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = report.solvable;
  if (!ok) failed++;
  console.log(
    `${ok ? "✓" : "✗"} ${lv.slug.padEnd(20)} diff=${String(report.difficulty).padStart(2)}` +
      ` moves=${String(report.minMoves).padStart(3)} states=${String(report.statesExplored).padStart(7)}` +
      ` split=${report.splitsRequired ? "Y" : "n"} ${ms}s` +
      ` [apples=${report.apples} crates=${report.crates} plates=${report.plates} keys=${report.keys}` +
      ` valves=${report.valves} bridges=${report.bridges} ice=${report.ice} dirt=${report.dirt}]`,
  );
}
console.log(failed === 0 ? "\nALL LEVELS CERTIFIED" : `\n${failed} LEVEL(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
