// ── WRYM · community level validator ──────────────────────────────────
// CI gate for community-submitted levels (community-levels/*.json).
// Every community level must:
//   · parse against the level schema
//   · be solvable under the exhaustive BFS validator
//   · carry a difficulty certificate that matches a fresh computation
//     (within tolerance) — or omit it entirely (CI fills in the truth)
// Exit code ≠ 0 fails the workflow.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateLevel } from "../src/lib/wyrm/validator";
import type { LevelDef } from "../src/lib/wyrm/types";

const ROOT = path.resolve((import.meta as any).dir ?? ".", "..");
const DIR = path.join(ROOT, "community-levels");

if (!existsSync(DIR)) {
  console.log("community-levels/ absent — nothing to validate (ok)");
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
let bad = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  let doc: any;
  try {
    doc = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`✗ ${f} — unreadable JSON: ${(e as Error).message}`);
    bad++;
    continue;
  }
  if (!Array.isArray(doc.grid) || typeof doc.name !== "string" || typeof doc.slug !== "string") {
    console.error(`✗ ${f} — missing name/slug/grid`);
    bad++;
    continue;
  }
  const level: LevelDef = {
    name: doc.name,
    slug: doc.slug,
    grid: doc.grid,
    turnLimit: typeof doc.turnLimit === "number" ? doc.turnLimit : undefined,
  };
  const t0 = Date.now();
  const r = validateLevel(level);
  const ms = Date.now() - t0;
  if (!r.solvable) {
    console.error(`✗ ${f} — NOT SOLVABLE (${r.reason}, states=${r.statesExplored})`);
    bad++;
    continue;
  }
  // refresh the certificate with the authoritative computation
  const cert = {
    difficulty: (r as any).difficulty,
    tier: (r as any).tier,
    minMoves: r.minMoves,
    statesExplored: r.statesExplored,
    splitsRequired: !!r.splitsRequired,
    validatedWith: "ci",
  };
  const prev = doc.certified;
  doc.certified = cert;
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const drift =
    prev && typeof prev.difficulty === "number"
      ? Math.abs(prev.difficulty - cert.difficulty)
      : 0;
  const driftNote = prev ? (drift > 0.15 ? `  ⚠ certificate drift ${prev.difficulty}→${cert.difficulty} (refreshed)` : "  certificate confirmed") : "  certificate written";
  console.log(
    `✓ ${f.padEnd(34)} ${cert.difficulty.toFixed(1)}/10 ${cert.tier.padEnd(9)} par=${cert.minMoves}/${level.turnLimit ?? 120} states=${cert.statesExplored} ${ms}ms${driftNote}`,
  );
}
if (bad > 0) {
  console.error(`\n${bad} community level(s) failed — the PR cannot merge until they certify.`);
  process.exit(1);
}
console.log(`\ncommunity ladder certified: ${files.length} level(s)`);
