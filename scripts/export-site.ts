// ── WYRM.LAB · static-site exporter ──────────────────────────────────
// Pure function of results/ → site/data/. The GitHub Pages site is a
// pure archive: this script does ALL computation at commit time, so
// the website itself needs zero computation and zero backend.
//
// Usage: bun scripts/export-site.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve((import.meta as any).dir ?? path.dirname(import.meta.url), "..");
const RESULTS = path.join(ROOT, "results");
const SITE = path.join(ROOT, "site");
const DATA = path.join(SITE, "data");

if (!existsSync(path.join(RESULTS, "levels.json"))) {
  console.error("results/levels.json missing — run `bun scripts/run-benchmark.ts` first");
  process.exit(1);
}

const levels = JSON.parse(readFileSync(path.join(RESULTS, "levels.json"), "utf8"));
const models = JSON.parse(readFileSync(path.join(RESULTS, "models.json"), "utf8")).filter((m) => m.enabled);

// ── collect runs ─────────────────────────────────────────────────────
interface RunDoc {
  schema: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: { key: string; name: string; kind: string; modelId?: string; note?: string };
  level: { slug: string; name: string; difficulty: number; minMoves: number; turnLimit: number };
  result: { status: string; attempts: number; deaths: number; movesUsed: number; applesEaten: number; score: number; llmError?: string };
  checker: { verdict: string };
  reliability: { calls: number; retries: number; degraded: number; rateWaitMs: number; tokensIn: number; tokensOut: number; costUsd: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: any[];
}

const runs: RunDoc[] = [];
const runsDir = path.join(RESULTS, "runs");
for (const modelDir of readdirSync(runsDir)) {
  const abs = path.join(runsDir, modelDir);
  for (const f of readdirSync(abs)) {
    if (!f.endsWith(".json")) continue;
    try {
      runs.push(JSON.parse(readFileSync(path.join(abs, f), "utf8")));
    } catch (e) {
      console.warn(`skip unreadable run ${modelDir}/${f}: ${(e as Error).message}`);
    }
  }
}

// ── pairwise Elo (identical to the in-app implementation) ────────────
const elos: Record<string, number> = {};
const bump = (m: string) => ((elos[m] ??= 1200), elos[m]);
const byLevel = new Map<string, RunDoc[]>();
for (const r of runs) {
  const arr = byLevel.get(r.level.slug) ?? [];
  arr.push(r);
  byLevel.set(r.level.slug, arr);
}
for (const [, rs] of byLevel) {
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.model.key === b.model.key) continue;
      const K = 32;
      const eA = 1 / (1 + Math.pow(10, (bump(b.model.key) - bump(a.model.key)) / 400));
      const sA =
        a.result.status === "won" && b.result.status !== "won" ? 1 :
        a.result.status !== "won" && b.result.status === "won" ? 0 :
        a.result.status === "won" && b.result.status === "won" ? (a.result.score >= b.result.score ? 1 : 0) : 0.5;
      elos[a.model.key] = Math.round(elos[a.model.key] + K * (sA - eA));
      elos[b.model.key] = Math.round(elos[b.model.key] + K * ((1 - sA) - (1 - eA)));
    }
  }
}

// ── per-model aggregates ─────────────────────────────────────────────
// Reliability is re-derived from the per-step sandbox audits so archives
// written by older runner versions still aggregate correctly.
function reliabilityOf(r: RunDoc) {
  let calls = 0, retries = 0, degraded = 0, rateWaitMs = 0, tokensIn = 0, tokensOut = 0;
  for (const s of r.steps as any[]) {
    const sb = s.sandbox;
    if (!sb) continue;
    calls++;
    const rel = sb.reliability;
    if (rel) {
      retries += Math.max(0, (rel.attempts ?? 1) - 1);
      if (rel.degraded) degraded++;
      rateWaitMs += rel.rateWaitMs ?? 0;
      tokensIn += rel.tokensIn ?? Math.ceil((sb.bytesIn ?? 0) / 4);
      tokensOut += rel.tokensOut ?? Math.ceil((sb.bytesOut ?? 0) / 4);
    } else {
      tokensIn += Math.ceil((sb.bytesIn ?? 0) / 4);
      tokensOut += Math.ceil((sb.bytesOut ?? 0) / 4);
    }
  }
  return { calls, retries, degraded, rateWaitMs, tokensIn, tokensOut };
}

const modelRows = models.map((m) => {
  const mine = runs.filter((r) => r.model.key === m.key);
  const solvedRuns = mine.filter((r) => r.result.status === "won");
  const certified = mine.filter((r) => r.checker?.verdict === "CERTIFIED").length;
  const rel = mine.map(reliabilityOf).reduce(
    (a, b) => ({
      calls: a.calls + b.calls, retries: a.retries + b.retries, degraded: a.degraded + b.degraded,
      rateWaitMs: a.rateWaitMs + b.rateWaitMs, tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut,
    }),
    { calls: 0, retries: 0, degraded: 0, rateWaitMs: 0, tokensIn: 0, tokensOut: 0 },
  );
  const avgLatency = rel.calls
    ? Math.round(mine.reduce((a, r) => a + r.steps.reduce((x, s: any) => x + ((s as any).latencyMs ?? 0), 0), 0) /
        Math.max(1, mine.reduce((a, r) => a + r.steps.length, 0)))
    : null;
  // efficiency vs par, averaged over solved runs
  const effs = solvedRuns.map((r) => r.level.minMoves / Math.max(1, r.result.movesUsed));
  return {
    key: m.key,
    name: m.name,
    kind: m.kind,
    elo: m.kind === "solver" ? null : Math.round(elos[m.key] ?? 1200),
    covered: mine.length,
    solved: solvedRuns.length,
    avgEfficiency: effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : null,
    deaths: mine.reduce((a, r) => a + r.result.deaths, 0),
    avgLatency,
    tokens: rel.tokensIn + rel.tokensOut,
    checkerPct: mine.length ? Math.round((certified / mine.length) * 100) : 0,
    retries: rel.retries,
    degraded: rel.degraded,
  };
});
modelRows.sort((a, b) => {
  const sa = a.solved / Math.max(1, a.covered), sb = b.solved / Math.max(1, b.covered);
  if (sa !== sb) return sb - sa;
  return (b.elo ?? 1200) - (a.elo ?? 1200);
});

// solver row goes last-but-visible: it's the reference line, not a competitor
const solverIdx = modelRows.findIndex((r) => r.kind === "solver");
let leaderboard = modelRows;
if (solverIdx >= 0) {
  const [solver] = modelRows.splice(solverIdx, 1);
  solver.elo = null;
  leaderboard = [...modelRows, solver];
}

// per-level coverage lines
const levelDocs = levels.map((l) => ({
  slug: l.slug,
  name: l.name,
  difficulty: l.difficulty,
  tier: l.tier ?? null,
  dims: l.dims ?? null,
  minMoves: l.minMoves,
  turnLimit: l.turnLimit,
  mechanics: l.mechanics,
  width: l.width,
  height: l.height,
  grid: l.grid,
  runs: runs
    .filter((r) => r.level.slug === l.slug)
    .map((r) => ({
      model: r.model.key,
      modelShort: r.model.name.replace(/\s*\(.*\)$/, ""),
      status: r.result.status,
      moves: r.result.movesUsed,
    })),
}));

const solvedCount = runs.filter((r) => r.result.status === "won").length;

const index = {
  schema: "wyrm.index/1",
  generatedAt: new Date().toISOString(),
  summary: {
    runs: runs.length,
    solved: solvedCount,
    solvedPct: runs.length ? Math.round((solvedCount / runs.length) * 100) : 0,
    levels: levels.length,
  },
  models: models.map((m) => ({ key: m.key, name: m.name, kind: m.kind, note: m.note ?? "" })),
  leaderboard,
  levels: levelDocs,
};

// ── write ────────────────────────────────────────────────────────────
mkdirSync(path.join(DATA, "runs"), { recursive: true });
writeFileSync(path.join(DATA, "index.json"), JSON.stringify(index));
writeFileSync(path.join(DATA, "levels.json"), JSON.stringify(levels, null, 2));
writeFileSync(path.join(DATA, "models.json"), JSON.stringify(models, null, 2));
for (const r of runs) {
  writeFileSync(path.join(DATA, "runs", `${r.model.key}__${r.level.slug}.json`), JSON.stringify(r));
}
// GitHub Pages: serve everything as-is
writeFileSync(path.join(SITE, ".nojekyll"), "");

console.log(
  `site archive exported: ${runs.length} run(s), ${levels.length} level(s), ${models.length} model(s) → site/data`,
);
console.log(
  "leaderboard:",
  leaderboard.map((r) => `${r.name}${r.elo ? " (" + r.elo + ")" : ""}`).join(" · "),
);
