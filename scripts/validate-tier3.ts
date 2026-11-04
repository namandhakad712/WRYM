// Validate the FULL ladder (Tiers I–IV) under the v3 difficulty index.
// Usage: bun scripts/validate-tier3.ts [slug ...]
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame } from "../src/lib/wyrm/engine";

const filter = process.argv.slice(2);
let failed = 0;
let totalScore = 0;

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
  if (ok) totalScore += report.difficulty;
  const d = report.dims;
  const dims = d
    ? ` d${d.depth.toFixed(0)} s${d.search.toFixed(0)} i${d.irreversibility.toFixed(0)} m${d.simulation.toFixed(0)} t${d.threat.toFixed(0)} c${d.choreography.toFixed(0)} b${d.budget.toFixed(0)}`
    : "";
  console.log(
    `${ok ? "✓" : "✗"} ${lv.slug.padEnd(20)} ${report.difficulty.toFixed(1).padStart(4)}/10 ${String(report.tier ?? "-").padEnd(9)}` +
      ` par=${String(report.minMoves).padStart(3)}/${lv.turnLimit ?? 120} states=${String(report.statesExplored).padStart(7)}` +
      ` split=${report.splitsRequired ? "Y" : "n"} ${dims} ${ms}s` +
      (report.reason ? ` — ${report.reason}` : ""),
  );
}
const n = filter.length ? HANDCRAFTED_LEVELS.filter((l) => filter.some((f) => l.slug.includes(f))).length : HANDCRAFTED_LEVELS.length;
console.log(
  failed === 0
    ? `\nALL ${n} LEVELS CERTIFIED — mean difficulty ${(totalScore / n).toFixed(1)}/10`
    : `\n${failed} LEVEL(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
