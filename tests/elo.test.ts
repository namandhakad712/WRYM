// ── WRYM · rating math (Bradley-Terry + bootstrap) ────────────────────
// The leaderboard's math must hold the properties that make it
// defensible: order-free fitting (reproducibility), bounded outputs,
// deterministic resampling (byte-reproducible exports), and battle
// rules that never contradict the arena's own definitions.

import { describe, expect, test } from "bun:test";
import {
  battleScoreOf,
  battlesFromRuns,
  bradleyTerry,
  bootstrapCI,
  eloUpdate,
  headToHead,
  type Battle,
} from "../src/lib/wyrm/elo";

describe("battle rules", () => {
  const won = { model: "a", levelSlug: "l1", status: "won", score: 500 };
  const lost = { model: "b", levelSlug: "l1", status: "dead", score: 0 };
  const wonBetter = { model: "a", levelSlug: "l1", status: "won", score: 900 };
  const wonWorse = { model: "b", levelSlug: "l1", status: "won", score: 300 };

  test("a solved run beats an unsolved one", () => {
    expect(battleScoreOf(won, lost)).toBe(1);
    expect(battleScoreOf(lost, won)).toBe(0);
  });

  test("two solved runs are separated by score", () => {
    expect(battleScoreOf(wonBetter, wonWorse)).toBe(1);
    expect(battleScoreOf(wonWorse, wonBetter)).toBe(0);
  });

  test("two failures draw", () => {
    expect(battleScoreOf(lost, { ...lost, model: "c" })).toBe(0.5);
  });

  test("battlesFromRuns pairs every shared-level couple exactly once", () => {
    const runs = [
      { model: "a", levelSlug: "l1", status: "won", score: 500 },
      { model: "b", levelSlug: "l1", status: "won", score: 400 },
      { model: "c", levelSlug: "l1", status: "dead", score: 0 },
      { model: "a", levelSlug: "l2", status: "dead", score: 0 }, // alone on l2
      { model: "a", levelSlug: "l1", status: "won", score: 500 }, // duplicate model+level
    ];
    const battles = battlesFromRuns(runs);
    // l1 pairs (same-model couples skipped): a-b, a-c, b-c, dup-a→b, dup-a→c = 5; l2 has no opponent
    expect(battles.length).toBe(5);
    for (const bt of battles) expect(bt.a).not.toBe(bt.b);
  });
});

describe("bradleyTerry (pooled MLE)", () => {
  const battles: Battle[] = [
    { a: "strong", b: "weak", sa: 1, level: "l1" },
    { a: "strong", b: "weak", sa: 1, level: "l2" },
    { a: "strong", b: "weak", sa: 1, level: "l3" },
    { a: "strong", b: "weak", sa: 0.5, level: "l4" },
  ];

  test("order-free: shuffling battles does not change ratings", () => {
    const x = bradleyTerry(battles);
    const y = bradleyTerry([...battles].reverse());
    expect(x).toEqual(y);
  });

  test("the dominant player rates higher", () => {
    const r = bradleyTerry(battles);
    expect(r.strong).toBeGreaterThan(r.weak);
  });

  test("ratings are finite, sane Elo-scale integers", () => {
    const r = bradleyTerry(battles);
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(4000);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test("perfect symmetry: all-draw field collapses to equal ratings", () => {
    const draws: Battle[] = [
      { a: "x", b: "y", sa: 0.5, level: "l1" },
      { a: "y", b: "z", sa: 0.5, level: "l2" },
      { a: "x", b: "z", sa: 0.5, level: "l3" },
    ];
    const r = bradleyTerry(draws);
    expect(r.x).toBe(r.y);
    expect(r.y).toBe(r.z);
    expect(r.x).toBe(1200); // anchor
  });

  test("prior keeps a 1-battle field finite", () => {
    const r = bradleyTerry([{ a: "only", b: "one", sa: 1, level: "l1" }]);
    expect(Number.isFinite(r.only)).toBe(true);
    expect(r.only).toBeGreaterThan(r.one);
  });

  test("empty / single-player inputs return empty (no fabricated ratings)", () => {
    expect(bradleyTerry([])).toEqual({});
    expect(bradleyTerry([{ a: "x", b: "x", sa: 1, level: "l" }])).toEqual({});
  });
});

describe("bootstrapCI (deterministic resampling)", () => {
  const battles: Battle[] = [
    { a: "p1", b: "p2", sa: 1, level: "l1" },
    { a: "p1", b: "p2", sa: 1, level: "l2" },
    { a: "p1", b: "p2", sa: 0, level: "l3" },
    { a: "p1", b: "p2", sa: 1, level: "l4" },
  ];

  test("same seed ⇒ byte-identical intervals (reproducible exports)", () => {
    expect(bootstrapCI(battles, { seed: 42 })).toEqual(bootstrapCI(battles, { seed: 42 }));
  });

  test("lo ≤ hi for every player, and brackets are ordered", () => {
    const ci = bootstrapCI(battles, { seed: 1, rounds: 200 });
    for (const { lo, hi } of Object.values(ci)) {
      expect(lo).toBeLessThanOrEqual(hi);
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeLessThan(4000);
    }
  });

  test("empty input ⇒ empty output", () => {
    expect(bootstrapCI([])).toEqual({});
  });
});

describe("legacy online Elo (live board)", () => {
  test("winner gains, loser loses, zero-sum", () => {
    const r = eloUpdate(
      { elo: 1200, score: 500, solved: true },
      { elo: 1200, score: 0, solved: false },
    );
    expect(r.newA).toBeGreaterThan(1200);
    expect(r.newB).toBeLessThan(1200);
    expect(r.newA + r.newB).toBe(2400); // K-factor conserves total points
    expect(r.expectedA).toBeGreaterThan(0);
    expect(r.expectedA).toBeLessThan(1);
  });

  test("upset swings more than expected win", () => {
    const fav = eloUpdate({ elo: 1500, score: 0, solved: false }, { elo: 1000, score: 1, solved: true });
    const exp = eloUpdate({ elo: 1500, score: 1, solved: true }, { elo: 1000, score: 0, solved: false });
    expect(1500 - fav.newA).toBeGreaterThan(1500 - exp.newA);
  });
});

describe("head-to-head ledger", () => {
  test("records orient consistently regardless of input order", () => {
    const battles: Battle[] = [
      { a: "x", b: "y", sa: 1, level: "l1" },
      { a: "y", b: "x", sa: 1, level: "l2" }, // y wins when listed first
      { a: "x", b: "y", sa: 0.5, level: "l3" },
    ];
    const h2h = headToHead(battles);
    expect(h2h.length).toBe(1);
    expect(h2h[0].a).toBe("x");
    expect(h2h[0].w).toBe(1); // x's win from l1
    expect(h2h[0].l).toBe(1); // y's win from l2, oriented
    expect(h2h[0].d).toBe(1);
  });
});
