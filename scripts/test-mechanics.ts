// Engine v2 mechanic unit tests: valves, ice, crumble, keys, turn limits.
// Run: bun scripts/test-mechanics.ts
import { createGame, step, replay } from "../src/lib/wyrm/engine";
import { projectObservation, parseActionReply, quarantineOutput } from "../src/lib/wyrm/sandbox";
import { LevelDef } from "../src/lib/wyrm/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

// ── VALVES ─────────────────────────────────────────────────────────
console.log("VALVES");
{
  const lv: LevelDef = {
    name: "valve test", slug: "t-valve",
    grid: [
      "#######",
      "#..v..#",
      "#..@..#",
      "#..X..#",
      "#######",
    ],
  };
  let s = createGame(lv);
  const down = step(s, "down"); // enters v moving down ⇒ OK
  check("enter valve with the arrow", down.valid);
  s = createGame(lv);
  // worm moves right, around, then tries to enter v from below moving up
  const up = step(s, "up");
  check("valve tile from above moving up is blocked", !up.valid && /one-way/.test(up.reason ?? ""));
}

// ── ICE ────────────────────────────────────────────────────────────
console.log("ICE");
{
  const lv: LevelDef = {
    name: "ice test", slug: "t-ice",
    grid: [
      "#########",
      "#.......#",
      "#..@....#",
      "#.......#",
      "#._____k#",
      "#...X...#",
      "#########",
    ],
  };
  let s = createGame(lv);
  // navigate (3,2) → (1,2) → (1,4), then slide right across the rink to the key at (7,4)
  for (const a of ["left", "left", "down", "down"] as const) s = step(s, a).state;
  check("positioned at rink edge", s.worm[0].x === 1 && s.worm[0].y === 4, `head=(${s.worm[0].x},${s.worm[0].y})`);
  const slide = step(s, "right");
  check("slide is valid", slide.valid);
  check("slide landed on the key cell", slide.state.worm[0].x === 7 && slide.state.worm[0].y === 4,
    `head=(${slide.state.worm[0].x},${slide.state.worm[0].y})`);
  check("key picked up on landing", slide.state.keysHeld === 1);
  check("slide event emitted", slide.events.some((e) => e.type === "slide"));
  check("slide counted ONE turn", slide.state.turn === 5, `turn=${slide.state.turn}`);
  // slide back: from (6,4) move left → slides to (1,4)
  const back = step(slide.state, "left");
  check("return slide stops at first non-ice", back.valid && back.state.worm[0].x === 1 && back.state.worm[0].y === 4,
    `head=(${back.state.worm[0].x},${back.state.worm[0].y})`);
  check("key still held after return", back.state.keysHeld === 1);
}
{
  // ice → spikes is fatal mid-slide
  const lv: LevelDef = {
    name: "ice death", slug: "t-ice-death",
    grid: [
      "#########",
      "#.......#",
      "#..@....#",
      "#.......#",
      "#.____~.#",
      "#...X...#",
      "#########",
    ],
  };
  let s = createGame(lv);
  for (const a of ["left", "left", "down", "down"] as const) s = step(s, a).state;
  const r = step(s, "right");
  check("sliding into spikes kills", r.valid && r.state.status === "dead");
}

// ── CRUMBLE ────────────────────────────────────────────────────────
console.log("CRUMBLE");
{
  const lv: LevelDef = {
    name: "bridge test", slug: "t-bridge",
    grid: [
      "#######",
      "#..@..#",
      "#.....#",
      "#..=..#",
      "#.....#",
      "#..X..#",
      "#######",
    ],
  };
  let s = createGame(lv);
  s = step(s, "down").state; // (3,1)→(3,2)? head at (3,1)... worm len1: head (3,1)
  s = step(s, "down").state; // onto bridge (3,3)
  check("standing on bridge keeps it intact", s.terrain[3][3] === "=");
  s = step(s, "down").state; // leave bridge → crumbles
  check("bridge crumbled after leaving", s.terrain[3][3] === "#");
  check("crumble event emitted", s.lastEvents.some((e) => e.type === "crumble"));
  check("pit recorded for renderer", s.pits.some((p) => p.x === 3 && p.y === 3));
  const blocked = step(s, "up");
  check("crumbled bridge is impassable", !blocked.valid);
}

// ── KEYS & LOCKS ───────────────────────────────────────────────────
console.log("KEYS");
{
  const lv: LevelDef = {
    name: "key test", slug: "t-key",
    grid: [
      "#######",
      "#..@k.#",
      "###L###",
      "#..X..#",
      "#######",
    ],
  };
  let s = createGame(lv);
  const locked = step(s, "down"); // into L without key
  check("lock blocks without key", !locked.valid && /locked/.test(locked.reason ?? ""));
  s = step(s, "right").state; // (4,1) — key!
  check("key picked up", s.keysHeld === 1);
  s = step(s, "left").state; // back above the lock
  const unlock = step(s, "down"); // into L with key
  check("lock opens with key", unlock.valid);
  check("key consumed", unlock.state.keysHeld === 0);
  check("lock terrain became floor", unlock.state.terrain[2][3] === ".");
}

// ── TURN LIMIT ─────────────────────────────────────────────────────
console.log("TURN LIMIT");
{
  const lv: LevelDef = {
    name: "budget", slug: "t-budget",
    grid: ["#####", "#@..#", "##X##"],
    turnLimit: 3,
  };
  let s = createGame(lv);
  check("turnLimit carried into state", s.turnLimit === 3);
  s = step(s, "right").state;
  s = step(s, "right").state;
  s = step(s, "left").state;
  check("exhausted at turn limit", s.status === "exhausted");
}

// ── SANDBOX ────────────────────────────────────────────────────────
console.log("SANDBOX");
{
  const lv: LevelDef = {
    name: "s", slug: "s",
    grid: ["#####", "#@.*#", "#..X#", "#####"],
  };
  const s = createGame(lv);
  const obs = projectObservation(s);
  check("observation is a frozen string", typeof obs === "string" && Object.isFrozen(obs));
  check("observation contains the board", obs.includes("CURRENT BOARD:"));
  check("observation hides engine internals", !obs.includes("lastEvents") && !obs.includes("bridgeTouched"));

  const v1 = parseActionReply('{"thought":"go","action":"up"}');
  check("clean reply accepted", v1.ok && v1.action === "up");
  const v2 = parseActionReply('{"thought":"dig","action":"north"}');
  check("invalid action rejected with violation", !v2.ok && v2.violations.some((x) => x.includes("not in")));
  const v3 = parseActionReply("I think up is best");
  check("prose reply rejected", !v3.ok);
  const q = quarantineOutput("x".repeat(9000));
  check("oversized output truncated + flagged", q.text.length === 8000 && q.violations.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
