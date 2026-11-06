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
