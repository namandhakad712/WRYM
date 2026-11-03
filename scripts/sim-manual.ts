// Simulate a manual action sequence against a level, printing each step.
// Usage: bun scripts/sim-manual.ts <slug> "right,right,down,..."
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { createGame, step, CHARS } from "../src/lib/wyrm/engine";
import type { Action } from "../src/lib/wyrm/types";

const slug = process.argv[2];
const seq = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean) as Action[];
const lv = HANDCRAFTED_LEVELS.find((l) => l.slug === slug)!;

let s = createGame(lv);
const draw = (st: ReturnType<typeof createGame>) => {
  const overlay = st.terrain.map((r) => [...r]) as any[][];
  st.apples.forEach((p) => (overlay[p.y][p.x] = CHARS.apple));
  st.crates.forEach((p) => (overlay[p.y][p.x] = CHARS.crate));
  st.keys.forEach((p) => (overlay[p.y][p.x] = CHARS.key));
  st.worm.forEach((p, i) => (overlay[p.y][p.x] = i === 0 ? CHARS.head : CHARS.body));
  return overlay.map((r) => r.join("")).join("\n");
};

console.log(`== ${slug} · start ==`);
console.log(draw(s));
for (let i = 0; i < seq.length; i++) {
  const a = seq[i];
  const r = step(s, a);
  if (!r.valid) {
    console.log(`\n✗ step ${i + 1} (${a}) INVALID: ${r.reason}`);
    break;
  }
  s = r.state;
  console.log(`\n-- step ${i + 1}: ${a} · turn ${s.turn} · status ${s.status} · keys ${s.keysHeld}`);
  if (r.events.length) console.log("   events: " + r.events.map((e) => e.type).join(","));
  console.log(draw(s));
  if (s.status !== "playing") break;
}
console.log(`\nfinal status: ${s.status}`);
