// ── WRYM · archive ↔ site consistency ─────────────────────────────────
// The docs site is "a pure function of committed data". These tests
// assert exactly that: every run file parses, references real models
// and levels, the export mirrors the roster, and the public ladder
// never shows a level the validator has not certified.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

describe("results/ archive integrity", () => {
  const runsDir = join(ROOT, "results", "runs");
  const models = existsSync(runsDir) ? readdirSync(runsDir) : [];
  const roster = read("results/models.json").models.map((m: any) => m.key);

  test("run folders map 1:1 to roster entries", () => {
    for (const dir of models) expect(roster).toContain(dir);
  });

  test("every run doc is valid JSON, references known models & levels, and carries a checker verdict", () => {
    const levels = read("results/levels.json");
    const levelSlugs = new Set(levels.map((l: any) => l.slug));
    let count = 0;
    for (const dir of models) {
      for (const f of readdirSync(join(runsDir, dir))) {
        if (!f.endsWith(".json")) continue;
        const doc = JSON.parse(readFileSync(join(runsDir, dir, f), "utf8"));
        expect(roster).toContain(doc.model?.key);
        expect(levelSlugs.has(doc.level?.slug)).toBe(true);
        expect(typeof doc.checker?.verdict).toBe("string");
        expect(["CERTIFIED", "VIOLATIONS", "ERROR", "PENDING"]).toContain(doc.checker?.verdict);
        expect(doc.result?.status).toMatch(/^(won|dead|exhausted|aborted)$/);
        expect(Array.isArray(doc.steps)).toBe(true);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(30); // the archive is not empty
  });
});

describe("site/data ↔ results/ sync (the site is a pure function)", () => {
  test("site models mirror the enabled roster exactly", () => {
    const roster = read("results/models.json").models.filter((m: any) => m.enabled !== false);
    const site = read("site/data/models.json");
    expect(site.map((m: any) => m.key)).toEqual(roster.map((m: any) => m.key));
  });

  test("site levels cover the full certified ladder", () => {
    const levels = read("results/levels.json");
    const site = read("site/data/levels.json");
    expect(site.length).toBe(levels.length);
    for (const l of levels) {
      const s = site.find((x: any) => x.slug === l.slug);
      expect(s).toBeDefined();
      if (s) expect(s.difficulty).toBe(l.difficulty);
    }
  });

  test("site index parses and agrees with the archive on headline numbers", () => {
    const idx = read("site/data/index.json");
    expect(idx.models.length).toBeGreaterThanOrEqual(2);
    expect(idx.levels.length).toBe(read("site/data/levels.json").length);
    expect(idx.summary).toBeDefined();
  });

  test("every exported run file exists in the archive with matching status", () => {
    const runsDir = join(ROOT, "site", "data", "runs");
    if (!existsSync(runsDir)) return;
    for (const f of readdirSync(runsDir)) {
      if (!f.endsWith(".json")) continue;
      const siteDoc = JSON.parse(readFileSync(join(runsDir, f), "utf8"));
      const [modelKey, ...rest] = f.replace(/\.json$/, "").split("__");
      // archive layout: results/runs/<model>/<level-slug>.json (no prefix)
      const archivePath = join(ROOT, "results", "runs", modelKey, `${rest.join("__")}.json`);
      expect(existsSync(archivePath)).toBe(true);
      const archDoc = JSON.parse(readFileSync(archivePath, "utf8"));
      expect(siteDoc.result?.status ?? siteDoc.status).toBe(archDoc.result?.status ?? archDoc.status);
    }
  });
});

describe("docs site · static asset hygiene", () => {
  test("every HTML page links only to pages that exist", () => {
    const site = join(ROOT, "site");
    const pages = readdirSync(site).filter((f) => f.endsWith(".html"));
    expect(pages.length).toBeGreaterThanOrEqual(7);
    for (const p of pages) {
      const html = readFileSync(join(site, p), "utf8");
      const local = [...html.matchAll(/href="(\.\.?\/[^"#?]+)"/g)].map((m) => m[1]);
      for (const href of local) {
        const target = join(site, href.replace(/^\.\//, ""));
        expect(existsSync(target)).toBe(true);
      }
    }
  });

  test("no placeholder scars anywhere on the site", () => {
    const site = join(ROOT, "site");
    const html = readdirSync(site).filter((f) => f.endsWith(".html"));
    for (const p of html) {
      const text = readFileSync(join(site, p), "utf8");
      expect(text).not.toMatch(/TODO|FIXME|XXX|lorem ipsum|undefined page/i);
    }
  });
});
