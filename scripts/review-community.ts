// ── WRYM · wyrm-bot reviewer brain ───────────────────────────────────
// Validates the community levels CHANGED by a pull request (and the full
// existing community ladder, so regressions fail too) and emits:
//   · a machine report (JSON)  — consumed by scripts/wyrm-bot.mjs
//   · a human report (markdown) — posted as the PR review card
//   · an exit code             — 0 = all pass, 1 = needs revision
//
// Usage:
//   bun scripts/review-community.ts \
//     [--changed <file with git-diff paths>] \
//     [--json out.json] [--md out.md] [--all]
//
// Without --changed, every community level is treated as "changed"
// (used by /wyrm revalidate and local testing).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateLevel } from "../src/lib/wyrm/validator";
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import type { LevelDef } from "../src/lib/wyrm/types";

const ROOT = path.resolve((import.meta as any).dir ?? ".", "..");
const DIR = path.join(ROOT, "community-levels");

// ── CLI ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] ?? "" : null;
};
const CHANGED_FILE = flag("changed");
const JSON_OUT = flag("json");
const MD_OUT = flag("md");

// ── policy constants (mirror the Level Forge limits) ─────────────────
const POLICY = {
  minW: 6, maxW: 22,
  minH: 6, maxH: 18,
  minTurns: 4, maxTurns: 240,
  maxStates: 25_000_000, // validator must terminate well inside CI
  slugRe: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  nameMax: 40,
};
const OFFICIAL_SLUGS = new Set(HANDCRAFTED_LEVELS.map((l) => l.slug));
const VALID_CHARS = /^[[\]#.@o*$%DX~+kL<>=^v_]*$/;

interface FileReport {
  file: string;
  status: "added" | "modified" | "deleted" | "unchanged";
  ok: boolean;
  errors: string[];
  warnings: string[];
  fixes: string[];
  level?: {
    slug: string;
    name: string;
    turnLimit: number;
    minMoves: number;
    difficulty: number;
    tier: string;
    statesExplored: number;
    splitsRequired: boolean;
    width: number;
    height: number;
    dims?: Record<string, number>;
    evidence?: Record<string, number>;
  };
  contributor?: { name?: string; github?: string; intent?: string; tags?: string[] };
  claimed?: { difficulty?: number; tier?: string; minMoves?: number };
}

function changedList(): string[] {
  if (!CHANGED_FILE || !existsSync(CHANGED_FILE)) return [];
  return readFileSync(CHANGED_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("community-levels/") && l.endsWith(".json"));
}

function diffStatus(file: string): FileReport["status"] {
  // crude but sufficient: the bot re-validates everything it reads; the
  // changed list only decides what gets a detailed card vs a mention.
  return "added";
}

function reviewFile(file: string, changed: boolean): FileReport {
  const rel = file.replace(/^community-levels\//, "");
  const p = path.join(DIR, rel);
  const r: FileReport = { file: rel, status: changed ? diffStatus(file) : "unchanged", ok: false, errors: [], warnings: [], fixes: [] };

  let doc: any;
  try {
    doc = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    r.errors.push(`unreadable JSON: ${(e as Error).message}`);
    r.fixes.push("Re-export the level from the Forge — it emits valid JSON by construction.");
    return r;
  }

  // ── schema (community-1 & community-2) ──────────────────────────────
  if (typeof doc.name !== "string" || !doc.name.trim()) r.errors.push("missing `name`");
  else if (doc.name.length > POLICY.nameMax) r.errors.push(`\`name\` longer than ${POLICY.nameMax} chars`);
  if (typeof doc.slug !== "string" || !POLICY.slugRe.test(doc.slug))
    r.errors.push("`slug` must be lowercase kebab-case (a-z, 0-9, dashes)");
  if (doc.slug && rel !== `${doc.slug}.json`)
    r.warnings.push(`file name should be \`${doc.slug}.json\` (CI renames are manual — please match them)`);
  if (!Array.isArray(doc.grid) || !doc.grid.length || doc.grid.some((row: any) => typeof row !== "string")) {
    r.errors.push("`grid` must be a non-empty array of strings");
    return r;
  }
  const turnLimit = typeof doc.turnLimit === "number" ? doc.turnLimit : 60;
  if (turnLimit < POLICY.minTurns || turnLimit > POLICY.maxTurns)
    r.errors.push(`\`turnLimit\` ${turnLimit} outside ${POLICY.minTurns}–${POLICY.maxTurns}`);

  // ── contributor card (community-2 envelope) ─────────────────────────
  const c = doc.contributor ?? {};
  if (doc.schema === "wyrm.level/community-2") {
    if (!c.name || typeof c.name !== "string") r.errors.push("community-2 requires `contributor.name` (use the Forge submission card)");
    if (!c.github || !/^[A-Za-z0-9-]{1,39}$/.test(String(c.github))) r.errors.push("community-2 requires a valid `contributor.github` handle");
    if (!c.intent || String(c.intent).trim().length < 20)
      r.errors.push("`contributor.intent` must describe the design idea in at least 20 characters");
  } else if (!doc.author) {
    r.warnings.push("no author/contributor block — credit will read “anonymous” (the Forge submission card fills this)");
  }
  r.contributor = {
    name: c.name ?? doc.author,
    github: c.github,
    intent: c.intent,
    tags: Array.isArray(c.tags) ? c.tags : undefined,
  };
  if (doc.certified) r.claimed = { difficulty: doc.certified.difficulty, tier: doc.certified.tier, minMoves: doc.certified.minMoves };

  // ── grid structure ──────────────────────────────────────────────────
  const w = doc.grid[0]?.length ?? 0;
  const h = doc.grid.length;
  if (doc.grid.some((row: string) => row.length !== w)) r.errors.push("ragged rows — every row must be the same width");
  if (w < POLICY.minW || w > POLICY.maxW) r.errors.push(`width ${w} outside ${POLICY.minW}–${POLICY.maxW}`);
  if (h < POLICY.minH || h > POLICY.maxH) r.errors.push(`height ${h} outside ${POLICY.minH}–${POLICY.maxH}`);
  const flat = doc.grid.join("");
  if ((flat.match(/@/g) || []).length !== 1) r.errors.push("exactly one worm head `@` is required");
  if ((flat.match(/X/g) || []).length !== 1) r.errors.push("exactly one heart goal `X` is required");
  const bad = flat.match(/[^#.@o*$%DX~+kL<>=^v_]/);
  if (bad) r.errors.push(`unknown grid character “${bad[0]}”`);
  if (r.errors.length) {
    r.fixes.push("Fix the structural issues above — the Forge flags all of these live while you paint.");
    return r;
  }
  if (OFFICIAL_SLUGS.has(doc.slug)) {
    r.errors.push(`slug “${doc.slug}” collides with an official ladder level — pick another name`);
    return r;
  }

  // ── the exhaustive BFS certification ────────────────────────────────
  const level: LevelDef = { name: doc.name, slug: doc.slug, grid: doc.grid, turnLimit };
  let report;
  try {
    report = validateLevel(level);
  } catch (e) {
    r.errors.push(`engine rejected the level: ${(e as Error).message}`);
    return r;
  }
  if (report.statesExplored > POLICY.maxStates) {
    r.errors.push(`search space too large (${report.statesExplored.toLocaleString()} states > ${POLICY.maxStates.toLocaleString()}) — the arena must stay certifiable inside CI`);
    r.fixes.push("Add walls or one-way valves to prune the state space, or shrink the board.");
  }
  if (!report.solvable) {
    r.errors.push(`NOT SOLVABLE — ${report.reason ?? "no winning line exists"} (${report.statesExplored.toLocaleString()} states explored)`);
    r.fixes.push("Check that every apple is reachable and the heart can be entered AFTER the last apple — one-way valves, burned bridges and spikes are the usual culprits.");
    return r;
  }
  if (report.minMoves > turnLimit) {
    r.errors.push(`optimal line is ${report.minMoves} moves but the turn limit is ${turnLimit}`);
    r.fixes.push(`Raise \`turnLimit\` to at least ${report.minMoves} (or redesign — tight budgets are a difficulty dimension, impossible ones are just broken).`);
  }

  // claimed certificate honesty check (tolerance — CI always recomputes)
  if (r.claimed?.difficulty != null && Math.abs(r.claimed.difficulty - report.difficulty) > 0.5)
    r.warnings.push(`claimed difficulty ${r.claimed.difficulty} ≠ computed ${report.difficulty.toFixed(1)} — the site will show the computed value`);

  r.ok = r.errors.length === 0;
  r.level = {
    slug: doc.slug,
    name: doc.name,
    turnLimit,
    minMoves: report.minMoves,
    difficulty: report.difficulty,
    tier: report.tier ?? "—",
    statesExplored: report.statesExplored,
    splitsRequired: !!(report as any).splitsRequired,
    width: w,
    height: h,
    dims: report.dims as any,
    evidence: report.evidence as any,
  };
  return r;
}

// ── run ───────────────────────────────────────────────────────────────
const changed = changedList();
const changedSet = new Set(changed.map((f) => f.replace(/^community-levels\//, "")));
const reports: FileReport[] = [];

if (existsSync(DIR)) {
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  // every changed file must exist on disk (deleted files handled below)
  for (const f of onDisk) {
    reports.push(reviewFile(path.join("community-levels", f), changedSet.has(f)));
  }
  // deletions of existing community levels are also reviewable events
  for (const f of changedSet) {
    if (!onDisk.includes(f)) {
      reports.push({
        file: f, status: "deleted", ok: true, errors: [], warnings: [],
        fixes: [], level: undefined,
      });
    }
  }
}

const failures = reports.filter((r) => !r.ok && r.status !== "deleted");
const changedFailures = failures.filter((r) => changedSet.has(r.file));
const allOk = failures.length === 0;
const changedOk = changedFailures.length === 0 && changedSet.size > 0 ? true : allOk;

// ── markdown report (the PR card) ─────────────────────────────────────
function mdEscape(s: string): string { return s.replace(/`/g, "`​`"); }
const lines: string[] = [];
const verdictLine = allOk
  ? "> ### ✅ CERTIFIED — awaiting maintainer approval"
  : "> ### ❌ NEEDS REVISION — returned to the contributor";

const card = reports.filter((r) => changedSet.has(r.file));
if (card.length) {
  lines.push(`<!-- wyrm-bot:community-review -->`);
  lines.push(`## 🪱 wyrm-bot · community level review`);
  lines.push("");
  lines.push(verdictLine);
  lines.push("");
  lines.push("| file | slug | verdict | par | difficulty | tier | states |");
  lines.push("|------|------|---------|-----|------------|------|--------|");
  for (const r of card) {
    const v = r.status === "deleted" ? "🗑 removed" : r.ok ? "✅ certified" : "❌ failed";
    lines.push(
      `| \`${mdEscape(r.file)}\` | ${r.level ? mdEscape(r.level.slug) : "—"} | ${v} | ${r.level ? r.level.minMoves : "—"} | ${r.level ? r.level.difficulty.toFixed(1) : "—"} | ${r.level ? r.level.tier : "—"} | ${r.level ? r.level.statesExplored.toLocaleString() : "—"} |`,
    );
  }
  lines.push("");
  for (const r of card) {
    lines.push(`<details${r.ok ? "" : " open"}><summary><b>${r.ok ? "✅" : "❌"} ${mdEscape(r.file)}</b></summary>`);
    lines.push("");
    if (r.contributor && (r.contributor.name || r.contributor.github)) {
      const who = r.contributor.github
        ? `**${mdEscape(r.contributor.name ?? r.contributor.github)}** ([@${mdEscape(r.contributor.github)}](https://github.com/${r.contributor.github}))`
        : `**${mdEscape(r.contributor.name ?? "anonymous")}**`;
      lines.push(`- contributor: ${who}${r.contributor.tags?.length ? " · " + r.contributor.tags.map((t) => `\`${t}\``).join(" ") : ""}`);
    }
    if (r.contributor?.intent) lines.push(`- intent: ${mdEscape(r.contributor.intent)}`);
    if (r.level) {
      const ev = r.level.evidence ?? {};
      lines.push(`- certificate: **par ${r.level.minMoves} / ${r.level.turnLimit} turns** · difficulty **${r.level.difficulty.toFixed(1)}/10 (${r.level.tier})** · ${r.level.statesExplored.toLocaleString()} states · ${r.level.splitsRequired ? "split required" : "no split"} · ${r.level.width}×${r.level.height}`);
      lines.push(`- mechanics on the optimal line: ${ev.digs ?? 0} digs · ${ev.pushes ?? 0} pushes · ${ev.slides ?? 0} slides · ${ev.bridgesBurned ?? 0} bridges burned · ${ev.unlocks ?? 0} unlocks · ${ev.splits ?? 0} splits`);
    }
    for (const e of r.errors) lines.push(`- ❌ ${mdEscape(e)}`);
    for (const wn of r.warnings) lines.push(`- ⚠️ ${mdEscape(wn)}`);
    for (const f of r.fixes) lines.push(`- 🔧 ${mdEscape(f)}`);
    if (r.ok && !r.errors.length && !r.warnings.length && !r.level) lines.push("- (level removed from the ladder)");
    lines.push("");
    lines.push(`</details>`);
    lines.push("");
  }
  lines.push(allOk
    ? "**Next step — maintainer approval.** This submission passed every machine check. A maintainer now plays judge: review the design intent above, then either"
    + " comment `/wyrm approve` (auto-merge engages) or `/wyrm request-changes <reason>` to send it back with notes."
    : "**This submission was returned for modification.** The issues above are exact and reproducible — fix them in the"
    + " [Level Forge](https://namandhakad712.github.io/WRYM/forge.html) (or by hand), push to this branch, and I will re-certify automatically.");
  lines.push("");
  lines.push(`<sub>wyrm-bot v2 · deterministic review — the same \`src/lib/wyrm\` engine, validator and v3 difficulty index this repository ships. Nothing here is a model's opinion.</sub>`);
}

writeOut();
function writeOut() {
  const json = {
    schema: "wyrm.bot-review/1",
    generatedAt: new Date().toISOString(),
    verdict: allOk ? "validated" : "needs-revision",
    changedCount: changedSet.size,
    reports: reports.map((r) => ({ ...r, changed: changedSet.has(r.file) })),
  };
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(json, null, 2));
  if (MD_OUT) writeFileSync(MD_OUT, lines.join("\n"));
  if (!MD_OUT && !JSON_OUT) console.log(lines.join("\n"));
}

// console summary for the Actions log
for (const r of reports) {
  const tag = changedSet.has(r.file) ? "changed" : "ladder";
  if (r.status === "deleted") { console.log(`🗑  ${r.file} — removed (${tag})`); continue; }
  console.log(`${r.ok ? "✓" : "✗"} ${r.file} [${tag}] ${r.ok ? `par ${r.level?.minMoves} · diff ${r.level?.difficulty.toFixed(1)} (${r.level?.tier})` : r.errors[0] ?? "failed"}`);
}
process.exit(allOk ? 0 : 1);
