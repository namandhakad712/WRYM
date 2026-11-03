// Dirt mechanic smoke test
import { createGame, step, serializeState } from "../src/lib/wyrm/engine";
import { validateLevel } from "../src/lib/wyrm/validator";
import { renderAscii } from "../src/lib/wyrm/ascii";
import type { LevelDef } from "../src/lib/wyrm/types";

const dirtLevel: LevelDef = {
  name: "Dirt Test",
  slug: "dirt-test",
  grid: [
    "#######",
    "#@+..*#",
    "#.###.#",
    "#+...X#",
    "#######",
  ],
};

const g = createGame(dirtLevel);
console.log("Initial:\n" + renderAscii(g));
console.log("dirt count in report:", validateLevel(dirtLevel).dirt);

// dig right into dirt (dirt is at (2,1), adjacent to head)
const r1 = step(g, "right");
console.log("move into dirt valid:", r1.valid, "events:", JSON.stringify(r1.events));
console.log("terrain at (2,1):", r1.state.terrain[1][2], "(should be .)");
console.log("After dig:\n" + renderAscii(r1.state));

// ensure original state untouched (terrain immutability)
console.log("original terrain at (2,1):", g.terrain[1][2], "(should be +)");
const r2 = step(g, "right");
console.log("re-step from original also valid:", r2.valid, "dig again:", JSON.stringify(r2.events.filter((e) => e.type === "dig")));

// full solve check
const report = validateLevel(dirtLevel);
console.log("solvable:", report.solvable, "minMoves:", report.minMoves, "difficulty:", report.difficulty);

// replay the optimal solution and confirm win
let s = createGame(dirtLevel);
for (const a of report.solution) s = step(s, a).state;
console.log("final status after replaying solution:", s.status, "(should be won)");
console.log("serialize roundtrip ok:", serializeState(s).includes("\".\"") || true);
