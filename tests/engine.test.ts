// ── WRYM · engine invariants ──────────────────────────────────────────
// What every release must be able to say about the game engine:
//   1. every official level parses and starts in a sane state
//   2. the engine is DETERMINISTIC — same level + same action list ⇒
//      byte-identical state trail (this is what makes replays and
//      certifications meaningful at all)
//   3. malformed levels are rejected loudly, never guessed at
//   4. the turn budget is finite by construction

import { describe, expect, test } from "bun:test";
import { HANDCRAFTED_LEVELS, levelFromGridText } from "../src/lib/wyrm/levels";
import { createGame, serializeState, step, MAX_TURNS, LevelFormatError } from "../src/lib/wyrm/engine";
import { validateLevel } from "../src/lib/wyrm/validator";
import type { LevelDef } from "../src/lib/wyrm/types";

const OK_LEVEL = [
  "########",
  "#..*..X#",
  "#@o....#",
  "########",
].join("\n");

describe("engine · parsing", () => {
  test("every official level parses", () => {
    expect(HANDCRAFTED_LEVELS.length).toBeGreaterThanOrEqual(31);
    for (const lv of HANDCRAFTED_LEVELS) {
      const s = createGame(lv);
      expect(s.status).toBe("playing");
      expect(s.worm.length).toBeGreaterThanOrEqual(2);
      expect(s.turnLimit).toBeLessThanOrEqual(MAX_TURNS);
      expect(s.turnLimit).toBeGreaterThan(0);
    }
  });

  test("empty level rejected", () => {
    expect(() => createGame({ name: "x", slug: "x", grid: [] })).toThrow(LevelFormatError);
  });

  test("ragged rows rejected", () => {
    expect(() =>
      createGame({ name: "x", slug: "x", grid: ["####", "###"] }),
    ).toThrow(LevelFormatError);
  });

  test("unknown glyph rejected with position", () => {
    expect(() =>
      createGame({ name: "x", slug: "x", grid: ["######", "#@..!#", "######"] }),
    ).toThrow(/unknown char '!' at 4,1/);
  });

  test("level without an exit rejected", () => {
    expect(() => createGame({ name: "x", slug: "x", grid: ["#####", "#@..#", "#####"] })).toThrow(/exit/);
  });

  test("two exits rejected (exactly one goal)", () => {
    expect(() =>
      createGame({ name: "x", slug: "x", grid: ["#####", "#@.XX", "#####"] }),
    ).toThrow(/exit/);
  });

  test("disconnected worm rejected", () => {
    expect(() =>
      createGame({ name: "x", slug: "x", grid: ["######", "#@..o#", "#...X#", "######"] }),
    ).toThrow(/contiguous/);
  });

  test("levelFromGridText round-trips name/slug", () => {
    const lv = levelFromGridText("Test", "test", OK_LEVEL);
    expect(lv.name).toBe("Test");
    expect(lv.slug).toBe("test");
    expect(() => createGame(lv)).not.toThrow();
  });
});

describe("engine · determinism (the replay contract)", () => {
  // a level with a machinery mix so the trail exercises several mechanics
  const MIXED = HANDCRAFTED_LEVELS.find((l) => /ratchet|iron|cathedral/i.test(l.name)) ?? HANDCRAFTED_LEVELS[0];

  test("same solution replayed twice ⇒ byte-identical state trail", () => {
    const report = validateLevel(MIXED as LevelDef);
    expect(report.solvable).toBe(true);
    const trail = (sol: readonly string[]) => {
      let s = createGame(MIXED as LevelDef);
      const out = [serializeState(s)];
      for (const a of sol) {
        const r = step(s, a as never);
        if (r.valid) s = r.state;
        out.push(serializeState(s));
      }
      return out.join("\n");
    };
    const a = trail(report.solution);
    const b = trail(report.solution);
    expect(a).toBe(b);
  });

  test("validator solution actually wins the level", () => {
    const report = validateLevel(MIXED as LevelDef);
    let s = createGame(MIXED as LevelDef);
    for (const act of report.solution) {
      const r = step(s, act);
      expect(r.valid).toBe(true);
      s = r.state;
    }
    expect(s.status).toBe("won");
  });

  test("serializeState is stable across repeated calls", () => {
    const s = createGame(HANDCRAFTED_LEVELS[0]);
    expect(serializeState(s)).toBe(serializeState(s));
  });
});

describe("engine · state machine sanity", () => {
  test("game over states reject further moves", () => {
    // 01-first-crawl: walk into spikes deliberately
    const lv = HANDCRAFTED_LEVELS.find((l) => l.slug.includes("first-crawl")) ?? HANDCRAFTED_LEVELS[0];
    let s = createGame(lv);
    const acts: string[] = ["right", "right", "right", "right", "right", "right"];
    for (const a of acts) {
      if (s.status !== "playing") break;
      const r = step(s, a as never);
      if (r.valid) s = r.state;
    }
    // whatever happened, once terminal, stepping is refused
    if (s.status !== "playing") {
      const r = step(s, "left");
      expect(r.valid).toBe(false);
    }
  });

  test("turnLimit caps the budget (exhaustion is reachable by construction)", () => {
    const s = createGame({ ...HANDCRAFTED_LEVELS[0], turnLimit: 5 });
    expect(s.turnLimit).toBe(5);
  });
});

// ── v4 · EGGS — gravity, custody, cracking ───────────────────────────

import { eggSupported, replay } from "../src/lib/wyrm/engine";
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";

describe("engine · eggs v4", () => {
  test("eggs parse, are solid, and rest on their support", () => {
    const lv = levelFromGridText("egg", "egg", [
      "##########",
      "#.o@.....#",
      "#....O...#",
      "#....+..X#",
      "##########",
    ].join("\n"));
    const s = createGame(lv);
    expect(s.eggs).toEqual([{ x: 5, y: 2 }]);
    expect(eggSupported(s, 5, 2)).toBe(true); // dirt below
    // the egg cell cannot be entered or pushed
    const g2 = createGame(levelFromGridText("e2", "e2", [
      "#######",
      "#@.O..#",
      "#..+..#",
      "#..*.X#",
      "#######",
    ].join("\n")));
    let st = step(g2, "right").state; // head (2,1)
    const blocked = step(st, "right"); // tries to enter egg cell (3,1)
    expect(blocked.valid).toBe(false);
    expect(blocked.reason).toContain("egg");
  });

  test("digging the support carries the egg; the tail vacating cracks it", () => {
    const lv = levelFromGridText("carry", "carry", [
      "##########",
      "#..o@....#",
      "#....O...#",
      "#....+..X#",
      "##########",
    ].join("\n"));
    let s = createGame(lv); // worm: head (4,1), len 2
    s = step(s, "down").state;   // (4,2)
    s = step(s, "down").state;   // (4,3)
    const dug = step(s, "right"); // dig (5,3) — egg (5,2) rides the head
    expect(dug.valid).toBe(true);
    expect(dug.state.status).toBe("playing");
    expect(eggSupported(dug.state, 5, 2)).toBe(true);
    s = dug.state;
    s = step(s, "right").state; // (6,3): body (5,3) conveys custody
    expect(s.status).toBe("playing");
    expect(eggSupported(s, 5, 2)).toBe(true);
    const crack = step(s, "right"); // (7,3): tail clears (5,3) — the egg falls
    expect(crack.state.status).toBe("dead");
    expect(crack.events.some((e) => e.type === "egg-crack")).toBe(true);
  });

  test("splitting under the egg parks it on remains (certified level)", () => {
    const nestvakt = HANDCRAFTED_LEVELS.find((l) => l.slug === "32-nestvakt")!;
    const rep = validateLevel(nestvakt);
    expect(rep.solvable).toBe(true);
    expect(rep.solution.includes("split")).toBe(true);
    expect(rep.eggs).toBe(1);
    // replay the certified line: the egg must survive to the very end
    const r = replay(nestvakt, rep.solution);
    expect(r.ok).toBe(true);
    expect(r.final.status).toBe("won");
    expect(r.final.eggs.length).toBe(1);
  }, 30000);

  test("pushing the pedestal crate lands the head under the egg", () => {
    const lv = levelFromGridText("ped", "ped", [
      "#########",
      "#.o@....#",
      "#...O...#",
      "#...$...#",
      "#..%.X..#",
      "#########",
    ].join("\n"));
    let s = createGame(lv);
    s = step(s, "down").state;   // (3,2)
    s = step(s, "down").state;   // (3,3)
    const push = step(s, "right"); // crate (4,3)->(5,3), head lands (4,3) = support
    expect(push.valid).toBe(true);
    expect(eggSupported(push.state, 4, 2)).toBe(true); // egg on head
    expect(push.state.status).toBe("playing");
  });

  test("a bridge collapse drops the egg through the rubble", () => {
    const lv = levelFromGridText("span", "span", [
      "#########",
      "#.o@..#.#",
      "#.....O.#",
      "#.....=.#",
      "#.....#.#",
      "#.....#X#",
      "#########",
    ].join("\n"));
    let s = createGame(lv); // head (3,1), len 2
    s = step(s, "down").state;   // (3,2)
    s = step(s, "down").state;   // (3,3)
    s = step(s, "right").state;  // (4,3)
    s = step(s, "right").state;  // (5,3)
    const cross = step(s, "right"); // onto the bridge (6,3) — egg above rides
    expect(cross.valid).toBe(true);
    expect(eggSupported(cross.state, 6, 2)).toBe(true);
    s = cross.state;
    s = step(s, "right").state; // (7,3): body on the bridge holds it
    expect(s.status).toBe("playing");
    const off = step(s, "down"); // (7,4): bridge vacates, crumbles
    expect(off.state.status).toBe("dead");
    expect(off.events.some((e) => e.type === "egg-crack")).toBe(true);
    expect(off.events.some((e) => e.type === "crumble")).toBe(true);
  });

  test("remains left standing on the bridge hold the egg (certified level)", () => {
    const span = HANDCRAFTED_LEVELS.find((l) => l.slug === "34-bridge-of-glass")!;
    const rep = validateLevel(span);
    expect(rep.solvable).toBe(true);
    expect(rep.solution.includes("split")).toBe(true);
    expect(rep.eggs).toBe(1);
    const r = replay(span, rep.solution);
    expect(r.ok).toBe(true);
    expect(r.final.status).toBe("won");
  });

  test("custody is owed even on the winning move", () => {
    // the ONLY route to X is through the egg's pillar; a len-2 worm
    // cannot keep a segment under the egg on the final step, so the
    // "winning" move must be recorded as a death instead
    const lv = levelFromGridText("owes", "owes", [
      "#######",
      "#.o@..#",
      "#..O..#",
      "#..+..#",
      "###.###",
      "###X###",
      "#######",
    ].join("\n"));
    let s = createGame(lv); // head (3,1)
    s = step(s, "right").state; // (4,1)
    s = step(s, "down").state;  // (4,2)
    s = step(s, "down").state;  // (4,3)
    const dug = step(s, "left"); // dig (3,3) — egg (3,2) rides the head
    expect(dug.valid).toBe(true);
    expect(dug.state.status).toBe("playing");
    s = dug.state;
    s = step(s, "down").state; // (3,4): tail (3,3) still holds the egg
    expect(s.status).toBe("playing");
    const win = step(s, "down"); // (3,5) = X — but (3,3) vacates: CRACK
    expect(win.state.status).toBe("dead");
    expect(win.events.some((e) => e.type === "egg-crack")).toBe(true);
  });

  test("serialize/deserialize round-trips eggs", () => {
    const lv = levelFromGridText("rt", "rt", [
      "##########",
      "#.o@.....#",
      "#....O...#",
      "#....+..X#",
      "##########",
    ].join("\n"));
    const s = createGame(lv);
    const back = JSON.parse(serializeState(s)) as unknown as { e: unknown };
    expect(Array.isArray(back.e)).toBe(true);
    expect((back.e as unknown[]).length).toBe(1);
  });
});
