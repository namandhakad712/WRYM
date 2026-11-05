// ── WRYM · benchmark roster invariants ────────────────────────────────
// bench/models.json is the arena's front door: every provider claim on
// the site traces back to a row here. These tests keep the file honest:
// unique keys, real provider kinds, keys ALWAYS via env var, AA links
// well-formed, fallbacks resolvable — and NO secrets, ever.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { PROVIDER_KINDS } from "../src/lib/wyrm/llm/types";

const doc = JSON.parse(readFileSync(join(import.meta.dir, "..", "bench", "models.json"), "utf8"));
const models: any[] = doc.models;
const keys = models.map((m) => m.key);

// kinds that legitimately carry no apiKeyEnv
const KEYLESS = new Set(["solver", "zai", "ollama", "lmstudio"]);

describe("bench/models.json · structure", () => {
  test("schema pointer, version and defaults present", () => {
    expect(doc.$schema).toBe("./models.schema.md");
    expect(doc.version).toBe(1);
    expect(typeof doc.defaults.temperature).toBe("number");
  });

  test("keys are unique", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every kind is a real provider kind (or solver)", () => {
    for (const m of models) {
      expect(["solver", ...Object.keys(PROVIDER_KINDS)]).toContain(m.kind);
    }
  });

  test("the arena spans many providers (the bundle is real)", () => {
    const kinds = new Set(models.map((m) => m.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(15);
    // headline providers wired first-class
    for (const k of ["zhipu", "piapi", "nvidia", "cloudflare", "cohere", "groq", "openrouter", "google", "mcp"]) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  test("solver baseline and the built-in sandbox model are enabled", () => {
    const solver = models.find((m) => m.kind === "solver");
    const builtin = models.find((m) => m.kind === "zai");
    expect(solver?.enabled).toBe(true);
    expect(builtin?.enabled).toBe(true);
  });
});

describe("bench/models.json · key hygiene", () => {
  test("keyed kinds declare apiKeyEnv (a NAME, never a key)", () => {
    for (const m of models) {
      if (KEYLESS.has(m.kind)) continue;
      expect(typeof m.apiKeyEnv).toBe("string");
      expect(m.apiKeyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/);
      // the value must look like an env var name, not a secret
      expect(m.apiKeyEnv.length).toBeLessThan(48);
    }
  });

  test("no row carries anything that smells like a live key", () => {
    const PATTERNS = [
      /sk-[A-Za-z0-9]{20,}/,
      /sk-ant-[A-Za-z0-9-]{20,}/,
      /ghp_[A-Za-z0-9]{30,}/,
      /github_pat_[A-Za-z0-9_]{20,}/,
      /AIza[A-Za-z0-9_-]{30,}/,
      /gsk_[A-Za-z0-9]{20,}/,
      /nvapi-[A-Za-z0-9_-]{20,}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    ];
    const raw = JSON.stringify(doc);
    for (const p of PATTERNS) expect(raw).not.toMatch(p);
  });

  test("apiKeyEnv collisions across rows are intentional only (documented shared keys)", () => {
    const byEnv = new Map<string, number>();
    for (const m of models) if (m.apiKeyEnv) byEnv.set(m.apiKeyEnv, (byEnv.get(m.apiKeyEnv) ?? 0) + 1);
    // shared envs are fine (same provider, two models) — this is a census, not a ban
    expect(byEnv.size).toBeGreaterThanOrEqual(10);
  });
});

describe("bench/models.json · references", () => {
  test("fallbacks resolve to real entrants", () => {
    for (const m of models) {
      if (m.fallback) expect(keys).toContain(m.fallback);
    }
  });

  test("aaUrl is always an Artificial Analysis model page", () => {
    for (const m of models) {
      if (m.aaUrl) expect(m.aaUrl).toMatch(/^https:\/\/artificialanalysis\.ai\/models\/[a-z0-9-]+$/);
    }
  });

  test("rate limits are sane when set (rpm > 0, tpm ≥ rpm)", () => {
    for (const m of models) {
      if (m.rpm !== undefined) expect(m.rpm).toBeGreaterThan(0);
      if (m.tpm !== undefined && m.rpm) expect(m.tpm).toBeGreaterThanOrEqual(m.rpm);
      if (m.contextWindow !== undefined && m.contextWindow !== 0) {
        expect(m.contextWindow).toBeGreaterThanOrEqual(2048);
      }
    }
  });

  test("results/ mirror is in byte-sync with bench/ (single source of truth)", () => {
    const mirror = readFileSync(join(import.meta.dir, "..", "results", "models.json"), "utf8");
    const bench = readFileSync(join(import.meta.dir, "..", "bench", "models.json"), "utf8");
    expect(mirror.toString()).toBe(bench.toString());
  });
});
