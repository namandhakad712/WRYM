// ── WRYM · level certification suite ─────────────────────────────────
// The same guarantee CI gives the repo, as a unit test: EVERY official
// level (and every community level) is parseable, solvable, replayable
// and honestly measured. A level that fails here never reaches the
// public ladder — this is the gate the whole "certified" claim rests on.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame, step } from "../src/lib/wyrm/engine";
import { TIER_ORDER, tierOf, TIER_BLURB } from "../src/lib/wyrm/difficulty";
import type { LevelDef } from "../src/lib/wyrm/types";

const VALID_TIERS = new Set(["TUTORIAL", "CORE", "ADVANCED", "GAUNTLET", "ABYSS", "NIGHTMARE"]);

// The full ladder certifies ~31 levels including Tier-V nightmares whose
// exhaustive BFS explores hundreds of thousands of states — far beyond
// bun's 5s default. One sweep, memoized by the validator cache, feeds
// every assertion that needs a report.
const LADDER_TIMEOUT_MS = 180_000;

describe("validator · official ladder", () => {
  test("every official level is solvable, replayable and honestly measured", () => {
    for (const lv of HANDCRAFTED_LEVELS) {
      const r = validateLevel(lv);
      expect(r.solvable).toBe(true);
      expect(r.minMoves).toBeGreaterThanOrEqual(1);
      expect(r.solution.length).toBe(r.minMoves);
      expect(r.difficulty).toBeGreaterThanOrEqual(0);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      if (r.tier) expect(VALID_TIERS.has(r.tier)).toBe(true);
      if (r.dims) {
        for (const [k, v] of Object.entries(r.dims)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
      // replay: the certified solution must actually win, first try
      let s = createGame(lv);
      for (const a of r.solution) {
        const st = step(s, a);
        expect(st.valid).toBe(true);
        s = st.state;
      }
      expect(s.status).toBe("won");
    }
  }, LADDER_TIMEOUT_MS);

  test("difficulty is a number with one decimal of honesty", () => {
    for (const lv of HANDCRAFTED_LEVELS) {
      const r = validateLevel(lv);
      expect(Number.isFinite(r.difficulty)).toBe(true);
      expect(Math.round(r.difficulty * 10) / 10).toBe(r.difficulty);
    }
  }, LADDER_TIMEOUT_MS);

  test("unsolvable levels are reported as such (never invented solutions)", () => {
    // apple sealed behind permanent wall: no path can exist
    const broken: LevelDef = {
      name: "Impossible",
      slug: "impossible",
      grid: [
        "#######",
        "#@..#*#",
        "#...#.X",
        "#######",
      ],
    };
    const r = validateLevel(broken);
    expect(r.solvable).toBe(false);
    expect(r.solution.length).toBe(0);
  });
});

describe("validator · community levels", () => {
  const dir = join(import.meta.dir, "..", "community-levels");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

  test(files.length ? `all ${files.length} community levels certify` : "community pipeline ready (none submitted yet)", () => {
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const lv: LevelDef = { name: doc.name, slug: doc.slug, grid: doc.grid, turnLimit: doc.turnLimit };
      const r = validateLevel(lv);
      expect(r.solvable).toBe(true);
      let s = createGame(lv);
      for (const a of r.solution) {
        const st = step(s, a);
        expect(st.valid).toBe(true);
        s = st.state;
      }
      expect(s.status).toBe("won");
    }
  });
});

describe("difficulty · tier system", () => {
  test("tierOf maps the full 0–10 range in order", () => {
    const tiers = [0, 2.5, 4.5, 6.5, 8, 9.5].map(tierOf);
    expect(tiers).toEqual([...tiers].sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b)));
  });

  test("every tier has a blurb and appears in TIER_ORDER", () => {
    for (const t of TIER_ORDER) expect(typeof TIER_BLURB[t]).toBe("string");
    expect(TIER_ORDER.length).toBe(Object.keys(TIER_BLURB).length);
  });

  test("official ladder spans multiple tiers (a real difficulty curve)", () => {
    const tiers = new Set(HANDCRAFTED_LEVELS.map((lv) => tierOf(validateLevel(lv).difficulty)));
    expect(tiers.size).toBeGreaterThanOrEqual(3);
  }, LADDER_TIMEOUT_MS);
});
