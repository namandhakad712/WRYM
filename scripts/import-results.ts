// ── WYRM.LAB · import committed results into the dashboard DB ────────
// The GitHub flow keeps the ledger in results/ (committed JSON). This
// script mirrors that archive into the local dashboard database so the
// control room shows exactly what the public site shows.
//
// Usage: bun scripts/import-results.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ROOT = path.resolve((import.meta as any).dir, "..");
const RESULTS = path.join(ROOT, "results");

async function main() {
  if (!existsSync(path.join(RESULTS, "levels.json"))) {
    console.error("results/ missing — run the benchmark first");
    process.exit(1);
  }

  // 1 · models (solver + every archived model key)
  const models = JSON.parse(readFileSync(path.join(RESULTS, "models.json"), "utf8"));
  for (const m of models) {
    await db.model.upsert({
      where: { key: m.key },
      create: { key: m.key, name: m.name, kind: m.kind === "solver" ? "solver" : "llm", elo: 1200 },
      update: { name: m.name },
    });
  }

  // 2 · levels
  const levels = JSON.parse(readFileSync(path.join(RESULTS, "levels.json"), "utf8"));
  for (const lv of levels) {
    const exists = await db.level.findUnique({ where: { slug: lv.slug } });
    if (!exists) {
      await db.level.create({
        data: {
          slug: lv.slug,
          name: lv.name,
          source: "handcrafted",
          grid: lv.grid.join("\n"),
          difficulty: lv.difficulty,
          minMoves: lv.minMoves,
          turnLimit: lv.turnLimit,
          mechanics: lv.mechanics.join(","),
          width: lv.width,
          height: lv.height,
          validated: true,
          validatorJson: JSON.stringify(lv),
        },
      });
    }
  }

  // 3 · runs + steps from the archive
  const runsDir = path.join(RESULTS, "runs");
  let imported = 0, skipped = 0;
  for (const modelDir of readdirSync(runsDir)) {
    for (const f of readdirSync(path.join(runsDir, modelDir))) {
      if (!f.endsWith(".json")) continue;
      const run = JSON.parse(readFileSync(path.join(runsDir, modelDir, f), "utf8"));
      const level = await db.level.findUnique({ where: { slug: run.level.slug } });
      const model = await db.model.findUnique({ where: { key: run.model.key } });
      if (!level || !model) { skipped++; continue; }
      const dup = await db.run.findFirst({
        where: { levelId: level.id, modelId: model.id, status: { not: "running" } },
      });
      if (dup) { skipped++; continue; }
      const created = await db.run.create({
        data: {
          levelId: level.id,
          modelId: model.id,
          status: run.result.status,
          attempt: run.result.attempts,
          movesUsed: run.result.movesUsed,
          applesEaten: run.result.applesEaten,
          splitsUsed: run.result.splitsUsed,
          deaths: run.result.deaths,
          score: run.result.score,
          latencyMs: run.steps.reduce((a: number, s: any) => a + (s.latencyMs ?? 0), 0),
          systemPrompt: run.systemPrompt?.slice(0, 8000) ?? "",
          checkerVerdict: run.checker?.verdict ?? null,
          checkerJson: JSON.stringify(run.checker ?? {}),
          startedAt: new Date(run.startedAt),
          endedAt: new Date(run.finishedAt),
        },
      });
      for (const s of run.steps as any[]) {
        await db.step.create({
          data: {
            runId: created.id,
            turn: s.turn,
            attempt: s.attempt,
            action: String(s.action).slice(0, 40),
            valid: s.valid,
            thought: s.thought?.slice(0, 3000),
            rawOutput: s.rawOutput?.slice(0, 6000),
            stateAscii: s.stateAscii,
            stateJson: s.stateJson,
            events: JSON.stringify(s.events),
            invalidReason: s.reason?.slice(0, 500),
            latencyMs: s.latencyMs,
            sandbox: s.sandbox ? JSON.stringify(s.sandbox).slice(0, 2000) : undefined,
          },
        });
      }
      imported++;
    }
  }

  // 4 · model aggregates
  for (const m of models) {
    const row = await db.model.findUnique({ where: { key: m.key }, include: { runRecords: true } });
    if (!row) continue;
    const done = row.runRecords.filter((r) => r.status !== "running");
    await db.model.update({
      where: { key: m.key },
      data: {
        runs: done.length,
        wins: done.filter((r) => r.status === "won").length,
        losses: done.filter((r) => r.status !== "won").length,
        totalMoves: done.reduce((a, r) => a + r.movesUsed, 0),
        totalDeaths: done.reduce((a, r) => a + r.deaths, 0),
      },
    });
  }

  console.log(`imported ${imported} run(s), skipped ${skipped}; levels: ${await db.level.count()}, runs: ${await db.run.count()}`);
}

main().finally(() => db.$disconnect());
