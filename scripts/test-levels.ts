// Certify every handcrafted level: solvability, optimal length, difficulty.
// Run: bun scripts/test-levels.ts
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame, step } from "../src/lib/wyrm/engine";
import { mechanicFamilies } from "../src/lib/wyrm/types";

let fail = 0;
for (const lv of HANDCRAFTED_LEVELS) {
  const t0 = Date.now();
  try {
    const g = createGame(lv);
    const r = validateLevel(lv);
    const ms = Date.now() - t0;
    if (!r.solvable) {
      fail++;
      console.log(`✗ ${lv.slug} UNSOLVABLE — ${r.reason} (${ms}ms)`);
      continue;
    }
    // verify the certified solution actually replays to a win
    let s = createGame(lv);
    let replayOk = true;
    for (const a of r.solution) {
      const res = step(s, a);
      if (!res.valid) { replayOk = false; break; }
      s = res.state;
    }
    if (!replayOk || s.status !== "won") {
      fail++;
      console.log(`✗ ${lv.slug} REPLAY MISMATCH (won=${s.status})`);
      continue;
    }
    console.log(
      `✓ ${lv.slug.padEnd(18)} ${lv.name.padEnd(16)} d=${r.difficulty}/10  min=${String(r.minMoves).padStart(3)}  states=${String(r.statesExplored).padStart(6)}  ${mechanicFamilies(lv.grid).join("+")}  ${ms}ms`,
    );
  } catch (e) {
    fail++;
    console.log(`✗ ${lv.slug} FORMAT ERROR — ${(e as Error).message}`);
  }
}
process.exit(fail ? 1 : 0);
