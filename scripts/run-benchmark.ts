// ── WYRM.LAB · headless benchmark runner ─────────────────────────────
// The LOCAL half of the GitHub flow: run the arena on your machine,
// write every artifact (steps, thoughts, telemetry) as JSON into
// results/, and commit. The Pages site is a pure function of results/.
//
// Usage:
//   bun scripts/run-benchmark.ts                       # full suite (all enabled models × all levels)
//   bun scripts/run-benchmark.ts --levels 01,13,20     # level subset (slug prefixes)
//   bun scripts/run-benchmark.ts --models wyrm-bfs     # model subset (keys)
//   bun scripts/run-benchmark.ts --attempts 1          # override attempts
//
// Guaranteed: deterministic engine, sandboxed observations, checker
// certification per run, resilience telemetry per model call.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import { createGame } from "../src/lib/wyrm/engine";
import { runThinker } from "../src/lib/wyrm/agents/thinker";
import { checkRun } from "../src/lib/wyrm/agents/checker";
import { computeScore } from "../src/lib/wyrm/elo";
import { thinkerSystemPrompt } from "../src/lib/wyrm/ascii";
import { mechanicFamilies } from "../src/lib/wyrm/types";
import type { LLMTarget, ProviderKind } from "../src/lib/wyrm/llm/types";
import { ENGINE_DEFAULTS, PROVIDER_KINDS } from "../src/lib/wyrm/llm/types";

// ── config ───────────────────────────────────────────────────────────
interface ModelCfg {
  key: string;
  name: string;
  kind: ProviderKind | "solver";
  modelId?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  note?: string;
  fallback?: string;
  enabled?: boolean;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  rpm?: number;
  tpm?: number;
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  costPerMtok?: number;
}

interface ModelsFile {
  version: number;
  defaults: Record<string, number>;
  models: ModelCfg[];
}

const ROOT = path.resolve((import.meta as any).dir, "..");
const BENCH = path.join(ROOT, "bench", "models.json");
const RESULTS = path.join(ROOT, "results");

const argv = process.argv.slice(2);
function argOf(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const levelFilter = argOf("--levels")?.split(",").map((s) => s.trim()) ?? [];
const modelFilter = argOf("--models")?.split(",").map((s) => s.trim()) ?? [];
const attemptsOverride = argOf("--attempts") ? Number(argOf("--attempts")) : undefined;

const file: ModelsFile = JSON.parse(readFileSync(BENCH, "utf8"));
const d = file.defaults ?? {};
const allModels = file.models.filter((m) => m.enabled !== false);
const models = modelFilter.length ? allModels.filter((m) => modelFilter.some((f) => m.key.startsWith(f))) : allModels;
const levels = levelFilter.length
  ? HANDCRAFTED_LEVELS.filter((l) => levelFilter.some((f) => l.slug.startsWith(f)))
  : HANDCRAFTED_LEVELS;

if (models.length === 0) {
  console.error("no models selected (check bench/models.json / --models)");
  process.exit(1);
}
if (levels.length === 0) {
  console.error("no levels selected");
  process.exit(1);
}

// ── model → LLM chain ────────────────────────────────────────────────
function targetOf(m: ModelCfg): LLMTarget {
  if (m.kind === "solver") throw new Error("solver needs no target");
  const keyEnv = m.apiKeyEnv;
  const apiKey = keyEnv ? (process.env[keyEnv] ?? "") : "";
  if (keyEnv && !apiKey) {
    throw new Error(`model ${m.key}: environment variable ${keyEnv} is not set — export it first (keys are never stored in the repo)`);
  }
  const meta = PROVIDER_KINDS[m.kind as ProviderKind] ?? PROVIDER_KINDS.custom;
  return {
    name: m.name,
    kind: m.kind as ProviderKind,
    baseUrl: m.baseUrl ?? meta.defaultBaseUrl,
    apiKey,
    modelId: m.modelId ?? meta.modelHint,
    temperature: m.temperature ?? d.temperature ?? 0.4,
    maxTokens: m.maxTokens ?? d.maxTokens ?? 1024,
    contextWindow: m.contextWindow ?? d.contextWindow ?? 0,
    rpm: m.rpm ?? d.rpm ?? 0,
    tpm: m.tpm ?? d.tpm ?? 0,
    concurrency: m.concurrency ?? d.concurrency ?? 0,
    timeoutMs: m.timeoutMs ?? d.timeoutMs ?? ENGINE_DEFAULTS.timeoutMs,
    maxRetries: m.maxRetries ?? d.maxRetries ?? ENGINE_DEFAULTS.maxRetries,
    retryBaseMs: m.retryBaseMs ?? d.retryBaseMs ?? ENGINE_DEFAULTS.retryBaseMs,
    costPerMtok: m.costPerMtok ?? 0,
  };
}

function chainOf(m: ModelCfg): LLMTarget[] {
  const chain: LLMTarget[] = [targetOf(m)];
  if (m.fallback) {
    const fb = file.models.find((x) => x.key === m.fallback);
    if (fb && fb.kind !== "solver") {
      try {
        chain.push(targetOf(fb));
      } catch {
        /* fallback env missing — proceed without it; the pipeline
           records the degradation honestly in the attempt log */
      }
    }
  }
  return chain;
}

// ── artifacts ────────────────────────────────────────────────────────
mkdirSync(path.join(RESULTS, "runs"), { recursive: true });

interface RunArtifact {
  schema: "wyrm.run/1";
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: { key: string; name: string; kind: string; modelId?: string; note?: string };
  level: {
    slug: string;
    name: string;
    grid: string[];
    turnLimit: number;
    mechanics: string[];
    difficulty: number;
    minMoves: number;
    statesExplored: number;
  };
  result: {
    status: string;
    attempts: number;
    deaths: number;
    movesUsed: number;
    applesEaten: number;
    splitsUsed: number;
    score: number;
    llmError?: string;
  };
  checker: { verdict: string; [k: string]: unknown };
  reliability: {
    calls: number;
    retries: number;
    degraded: number;
    rateWaitMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  systemPrompt: string;
  steps: Array<{
    turn: number;
    attempt: number;
    action: string;
    valid: boolean;
    reason?: string;
    thought?: string;
    rawOutput?: string;
    stateAscii: string;
    stateJson: string;
    events: unknown[];
    latencyMs: number;
    sandbox?: unknown;
  }>;
}

let done = 0;
const total = models.length * levels.length;
const t0All = Date.now();

for (const m of models) {
  let chain: LLMTarget[] | null = null;
  if (m.kind !== "solver") {
    try {
      chain = chainOf(m);
    } catch (e) {
      console.log(`⏭ ${m.key}: ${(e as Error).message}`);
      continue;
    }
  }

  for (const lv of levels) {
    const tag = `[${++done}/${total}] ${m.key} × ${lv.slug}`;
    const t0 = Date.now();
    const report = validateLevel(lv);
    if (!report.solvable) {
      console.log(`${tag} — level failed certification, skipped`);
      continue;
    }

    const result = await runThinker(lv, m.key, {
      maxAttempts: attemptsOverride ?? d.attempts ?? 3,
      ...(chain ? { llmChain: chain } : {}),
    });

    const checker = checkRun(lv, {
      steps: result.steps.map((s) => ({
        action: s.action as never,
        valid: s.valid,
        attempt: s.attempt,
        stateJson: s.stateJson,
        events: JSON.stringify(s.events),
      })),
      claimedStatus: result.status === "aborted" || result.status === "interrupted" ? "aborted" : result.status,
    });

    const score = computeScore(result.movesUsed, result.status === "won", result.deaths);

    // reliability roll-up from the per-step sandbox audits
    let retries = 0, degraded = 0, rateWaitMs = 0, tokensIn = 0, tokensOut = 0, costUsd = 0, calls = 0;
    for (const s of result.steps) {
      if (!s.sandboxJson) continue;
      try {
        const audit = JSON.parse(s.sandboxJson);
        const rel = audit.reliability;
        if (rel) {
          calls++;
          retries += Math.max(0, (rel.attempts ?? 1) - 1);
          if (rel.degraded) degraded++;
          rateWaitMs += rel.rateWaitMs ?? 0;
          tokensIn += rel.tokensIn ?? 0;
          tokensOut += rel.tokensOut ?? 0;
        }
      } catch { /* audit parse is best-effort */ }
    }
    if (chain?.[0]?.costPerMtok) costUsd = ((tokensIn + tokensOut) / 1_000_000) * chain[0].costPerMtok;

    const artifact: RunArtifact = {
      schema: "wyrm.run/1",
      runId: `${m.key}__${lv.slug}__${new Date().toISOString().replace(/[:.]/g, "-")}`,
      startedAt: new Date(t0).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      model: { key: m.key, name: m.name, kind: m.kind, modelId: m.modelId, note: m.note },
      level: {
        slug: lv.slug,
        name: lv.name,
        grid: lv.grid,
        turnLimit: lv.turnLimit ?? 120,
        mechanics: mechanicFamilies(lv.grid),
        difficulty: report.difficulty,
        minMoves: report.minMoves,
        statesExplored: report.statesExplored,
      },
      result: {
        status: result.status,
        attempts: result.attempts,
        deaths: result.deaths,
        movesUsed: result.movesUsed,
        applesEaten: result.applesEaten,
        splitsUsed: result.splitsUsed,
        score,
        llmError: result.llmError,
      },
      checker: checker as unknown as { verdict: string } & Record<string, unknown>,
      reliability: { calls, retries, degraded, rateWaitMs, tokensIn, tokensOut, costUsd },
      systemPrompt: m.kind === "solver" ? "Baseline agent: exhaustive BFS — provably optimal play." : thinkerSystemPrompt(),
      steps: result.steps.map((s) => ({
        turn: s.turn,
        attempt: s.attempt,
        action: s.action,
        valid: s.valid,
        reason: s.reason,
        thought: s.thought,
        rawOutput: s.rawOutput,
        stateAscii: s.stateAscii,
        stateJson: s.stateJson,
        events: s.events,
        latencyMs: s.latencyMs,
        sandbox: s.sandboxJson ? safeJson(s.sandboxJson) : undefined,
      })),
    };

    const dir = path.join(RESULTS, "runs", m.key);
    mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${lv.slug}.json`);
    writeFileSync(out, JSON.stringify(artifact));

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const moves = `${result.movesUsed}/${lv.turnLimit ?? 120}`;
    console.log(
      `${tag} → ${result.status.toUpperCase().padEnd(9)} moves ${moves.padEnd(7)} deaths ${result.deaths}` +
        ` score ${String(score).padStart(4)} checker ${checker.verdict}${result.llmError ? ` llmErr=${result.llmError.slice(0, 60)}` : ""} (${secs}s)`,
    );
  }
}

// ── static registries the site reads ────────────────────────────────
writeFileSync(
  path.join(RESULTS, "models.json"),
  JSON.stringify(
    file.models.map((m) => ({
      key: m.key,
      name: m.name,
      kind: m.kind,
      modelId: m.modelId,
      note: m.note,
      enabled: m.enabled !== false,
    })),
    null,
    2,
  ),
);

// levels.json always covers the FULL ladder, whatever subset this
// invocation ran — partial invocations must never shrink the registry.
const levelDocs = HANDCRAFTED_LEVELS.map((lv) => {
  const report = validateLevel(lv);
  const g = createGame(lv);
  return {
    slug: lv.slug,
    name: lv.name,
    grid: lv.grid,
    turnLimit: lv.turnLimit ?? 120,
    mechanics: mechanicFamilies(lv.grid),
    width: g.width,
    height: g.height,
    difficulty: report.difficulty,
    minMoves: report.minMoves,
    statesExplored: report.statesExplored,
    splitsRequired: report.splitsRequired,
    counts: {
      apples: report.apples, crates: report.crates, plates: report.plates,
      keys: report.keys, valves: report.valves, bridges: report.bridges,
      ice: report.ice, dirt: report.dirt,
    },
  };
});
writeFileSync(path.join(RESULTS, "levels.json"), JSON.stringify(levelDocs, null, 2));

console.log(`\nbenchmark complete: ${done} run(s) in ${((Date.now() - t0All) / 1000 / 60).toFixed(1)} min → results/`);

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s.slice(0, 500) };
  }
}
