// ── WYRM.LAB · static-site exporter v2 ───────────────────────────────
// Pure function of results/ → site/data/. The GitHub Pages site is a
// pure archive: this script does ALL computation at commit time, so the
// website itself needs zero computation and zero backend.
//
// v2 (deep-research sprint, Nov 2026) — the exporter now applies the
// lessons of the best LLM game benchmarks:
//   · pooled Bradley-Terry MLE + bootstrap 95% CI  (LMArena / Kaggle
//     Game Arena estimator) instead of order-dependent online Elo
//   · per-level capability tags + per-model capability profiles
//     (SmartPlay's capability decomposition)
//   · fine-grained progress scores on every run (BALROG's partial
//     credit) and a failure taxonomy per model (Terminal-Bench-style
//     error analysis)
//   · certified mirror-variant summary (LMGame-Bench-style
//     contamination resistance)
//
// Usage: bun scripts/export-site.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { battlesFromRuns, bradleyTerry, bootstrapCI, headToHead } from "../src/lib/wyrm/elo";
import { capabilitiesOf, CAPABILITIES, type CapabilityKey } from "../src/lib/wyrm/capabilities";
import { progressOfRun } from "../src/lib/wyrm/progress";

const ROOT = path.resolve((import.meta as any).dir ?? path.dirname(import.meta.url), "..");
const RESULTS = path.join(ROOT, "results");
const SITE = path.join(ROOT, "site");
const DATA = path.join(SITE, "data");

if (!existsSync(path.join(RESULTS, "levels.json"))) {
  console.error("results/levels.json missing — run `bun scripts/run-benchmark.ts` first");
  process.exit(1);
}

const levels = JSON.parse(readFileSync(path.join(RESULTS, "levels.json"), "utf8"));

// ── community levels (PR-submitted via the Level Forge) ─────────────
const COMMUNITY = path.join(ROOT, "community-levels");
if (existsSync(COMMUNITY)) {
  for (const f of readdirSync(COMMUNITY)) {
    if (!f.endsWith(".json")) continue;
    try {
      const doc = JSON.parse(readFileSync(path.join(COMMUNITY, f), "utf8"));
      const entry = {
        slug: doc.slug || f.replace(/\.json$/, ""),
        name: doc.name || doc.slug,
        grid: doc.grid,
        turnLimit: doc.turnLimit ?? 120,
        mechanics: ["community"],
        community: true,
        author: doc.contributor?.name ?? (doc.author || "anonymous"),
        contributorGithub: doc.contributor?.github,
        contributorIntent: doc.contributor?.intent,
        tags: doc.contributor?.tags ?? [],
      };
      // results/levels.json carries the certified stats (difficulty etc.)
      // — find them by slug; CI certifies community levels too.
      const cert = (levels as any[]).find((l) => l.slug === entry.slug);
      if (cert) Object.assign(entry, { difficulty: cert.difficulty, tier: cert.tier,
        dims: cert.dims, minMoves: cert.minMoves, statesExplored: cert.statesExplored,
        counts: cert.counts, splitsRequired: cert.splitsRequired, width: cert.width, height: cert.height });
      else Object.assign(entry, { difficulty: doc.certified?.difficulty ?? 0,
        tier: doc.certified?.tier ?? "COMMUNITY", minMoves: doc.certified?.minMoves ?? -1,
        statesExplored: doc.certified?.statesExplored ?? 0,
        dims: {}, counts: {}, splitsRequired: !!doc.certified?.splitsRequired,
        width: doc.grid[0]?.length ?? 0, height: doc.grid.length ?? 0 });
      if (!(levels as any[]).some((l) => l.slug === entry.slug)) (levels as any[]).push(entry);
      else { const i = (levels as any[]).findIndex((l) => l.slug === entry.slug); (levels as any[])[i] = { ...(levels as any[])[i], ...entry }; }
    } catch (e) {
      console.warn(`skip unreadable community level ${f}: ${(e as Error).message}`);
    }
  }
}
// bench/models.json (byte-mirrored into results/) is a wrapped document:
// { $schema, version, comment, defaults, models: [...] } — the roster is
// the inner array. Filter to enabled entrants only.
const modelsDoc = JSON.parse(readFileSync(path.join(RESULTS, "models.json"), "utf8"));
const models: any[] = (Array.isArray(modelsDoc) ? modelsDoc : (modelsDoc.models ?? [])).filter((m) => m.enabled);

// ── collect runs ─────────────────────────────────────────────────────
interface RunDoc {
  schema: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: { key: string; name: string; kind: string; modelId?: string; note?: string };
  level: { slug: string; name: string; difficulty: number; minMoves: number; turnLimit: number; grid?: string[] };
  result: { status: string; attempts: number; deaths: number; movesUsed: number; applesEaten: number; score: number; llmError?: string };
  checker: { verdict: string };
  reliability: { calls: number; retries: number; degraded: number; rateWaitMs: number; tokensIn: number; tokensOut: number; costUsd: number };
  // archived step docs are intentionally loose (replay payloads vary by model)
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

// ── rating: pooled Bradley-Terry MLE + bootstrap CI ──────────────────
// (Chatbot Arena / Kaggle Game Arena method — order-free, uncertainty-
// quantified; supersedes the old K=32 online Elo)
const battles = battlesFromRuns(
  runs.map((r) => ({ model: r.model.key, levelSlug: r.level.slug, status: r.result.status, score: r.result.score })),
);
const bt = bradleyTerry(battles);
const ci = bootstrapCI(battles, { rounds: 400, seed: 0x572e });
const h2h = headToHead(battles);
const battlesByModel: Record<string, number> = {};
for (const b of battles) {
  battlesByModel[b.a] = (battlesByModel[b.a] ?? 0) + 1;
  battlesByModel[b.b] = (battlesByModel[b.b] ?? 0) + 1;
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

// failure taxonomy (Terminal-Bench-style error analysis)
function failuresOf(mine: RunDoc[]) {
  let spikeDeaths = 0;
  let exhausted = 0;
  let dead = 0;
  let aborted = 0;
  let invalidActions = 0;
  let totalSteps = 0;
  for (const r of mine) {
    if (r.result.status === "exhausted") exhausted++;
    else if (r.result.status === "dead") dead++;
    else if (r.result.status === "aborted" || r.result.status === "interrupted" || r.result.llmError) aborted++;
    for (const s of r.steps as any[]) {
      totalSteps++;
      if (s.valid === false) invalidActions++;
      for (const e of s.events ?? []) if (e && e.type === "spike") spikeDeaths++;
    }
  }
  return {
    spikeDeaths,
    exhausted,
    dead,
    aborted,
    invalidActions,
    invalidPct: totalSteps ? Math.round((invalidActions / totalSteps) * 100) : 0,
  };
}

// per-level capability records (computed once, reused for profiles)
const capsBySlug: Record<string, ReturnType<typeof capabilitiesOf>> = {};
for (const l of levels as any[]) {
  capsBySlug[l.slug] = capabilitiesOf({
    grid: l.grid,
    dims: l.dims ?? {},
    minMoves: typeof l.minMoves === "number" ? l.minMoves : 0,
    turnLimit: l.turnLimit ?? 120,
  });
}

// model × level result lookup for capability profiles
const runByModelLevel = new Map<string, RunDoc>();
for (const r of runs) runByModelLevel.set(`${r.model.key}::${r.level.slug}`, r);

function capabilityProfile(modelKey: string) {
  const out: { key: CapabilityKey; label: string; pct: number }[] = [];
  for (const key of Object.keys(CAPABILITIES) as CapabilityKey[]) {
    let wsum = 0;
    let vsum = 0;
    for (const [slug, caps] of Object.entries(capsBySlug)) {
      // only levels where the capability is genuinely TAGGED — a tutorial
      // level's faint planning signal must not inflate a profile
      if (!caps.tags.includes(key)) continue;
      const s = caps.scores[key];
      if (!s || s <= 0) continue;
      const r = runByModelLevel.get(`${modelKey}::${slug}`);
      if (!r) continue; // only levels this model actually ran
      wsum += s;
      vsum += s * (r.result.status === "won" ? 100 : progressOfRun(r));
    }
    if (wsum > 0) out.push({ key, label: CAPABILITIES[key].label, pct: Math.round(vsum / wsum) });
  }
  return out;
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
  const progress = mine.length ? Math.round(mine.reduce((a, r) => a + progressOfRun(r), 0) / mine.length) : null;
  const band = ci[m.key];
  return {
    key: m.key,
    name: m.name,
    kind: m.kind,
    aaUrl: (m as any).aaUrl ?? null,
    // solver is the visible reference line, not a rated competitor
    elo: m.kind === "solver" ? null : (bt[m.key] ?? null),
    eloCi: m.kind === "solver" || !band ? null : [band.lo, band.hi],
    battles: battlesByModel[m.key] ?? 0,
    covered: mine.length,
    solved: solvedRuns.length,
    avgProgress: progress,
    caps: capabilityProfile(m.key),
    failures: failuresOf(mine),
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
  return (b.elo ?? 0) - (a.elo ?? 0);
});

// honesty rule: a model with zero archived runs is configured, not ranked.
// It stays in data/models.json (with a note) but never shows a default Elo.
const ranked = modelRows.filter((r) => r.covered > 0);
const unranked = modelRows.filter((r) => r.covered === 0);

// solver row goes last-but-visible: it's the reference line, not a competitor
const solverIdx = ranked.findIndex((r) => r.kind === "solver");
let leaderboard = ranked;
if (solverIdx >= 0) {
  const [solver] = ranked.splice(solverIdx, 1);
  solver.elo = null;
  solver.eloCi = null;
  leaderboard = [...ranked, solver];
}

// per-level coverage lines
const levelDocs = levels.map((l: any) => {
  const caps = capsBySlug[l.slug] ?? { tags: [], scores: {} };
  const apples = (l.grid.join("").match(/\*/g) || []).length;
  return {
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
    apples,
    capabilities: { tags: caps.tags, scores: caps.scores },
    community: l.community ?? false,
    author: l.author ?? null,
    contributorGithub: l.contributorGithub ?? null,
    contributorIntent: l.contributorIntent ?? null,
    tags: l.tags ?? [],
    runs: runs
      .filter((r) => r.level.slug === l.slug)
      .map((r) => ({
        model: r.model.key,
        modelShort: r.model.name.replace(/\s*\(.*\)$/, ""),
        status: r.result.status,
        moves: r.result.movesUsed,
        progress: progressOfRun(r),
      })),
  };
});

const solvedCount = runs.filter((r) => r.result.status === "won").length;

// mirror-variant registry (contamination check, see scripts/make-variants.ts)
let variants: { certified: number; total: number; method: string; fullParity: boolean } | null = null;
const variantsPath = path.join(RESULTS, "variants.json");
if (existsSync(variantsPath)) {
  try {
    const v = JSON.parse(readFileSync(variantsPath, "utf8"));
    variants = {
      certified: v.certified,
      total: v.total,
      method: v.method,
      fullParity: (v.levels ?? []).every((x: any) => x.parity),
    };
  } catch { /* absent — site omits the section */ }
}

const index = {
  schema: "wyrm.index/2",
  generatedAt: new Date().toISOString(),
  summary: {
    runs: runs.length,
    solved: solvedCount,
    solvedPct: runs.length ? Math.round((solvedCount / runs.length) * 100) : 0,
    levels: levels.length,
    battles: battles.length,
    ratingMethod: "pooled Bradley-Terry MLE · bootstrap 95% CI (400 rounds)",
    variants,
  },
  models: models.map((m) => ({ key: m.key, name: m.name, kind: m.kind, aaUrl: (m as any).aaUrl ?? null, note: m.note ?? "" })),
  leaderboard,
  unranked: unranked.map((r) => ({ key: r.key, name: r.name, kind: r.kind, aaUrl: r.aaUrl ?? null })),
  headToHead: h2h.map((x) => ({ a: x.a, b: x.b, w: x.w, d: x.d, l: x.l })),
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
  `site archive exported: ${runs.length} run(s), ${levels.length} level(s), ${models.length} model(s), ${battles.length} battle(s) → site/data`,
);
console.log(
  "BT ratings:",
  Object.entries(bt).map(([k, v]) => `${k} ${v}${ci[k] ? ` [${ci[k].lo}..${ci[k].hi}]` : ""}`).join(" · ") || "(no battles yet)",
);
