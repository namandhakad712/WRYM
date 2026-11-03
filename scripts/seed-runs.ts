// Seed the full demo dataset: solver runs on all levels + LLM runs.
// Run: bun scripts/seed-runs.ts [llm-slug ...]
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const { ensureBootstrap, runSolverRun, runLlmRun } = await import("../src/lib/wyrm/orchestrator");
  await ensureBootstrap();

  const levels = await db.level.findMany({ orderBy: { slug: "asc" } });
  const bfs = await db.model.findUnique({ where: { key: "wyrm-bfs" } });
  if (!bfs) throw new Error("no bfs model");

  // baseline solver on every level that has no solver run yet
  for (const lv of levels) {
    const existing = await db.run.findFirst({ where: { levelId: lv.id, modelId: bfs.id } });
    if (existing) continue;
    const t0 = Date.now();
    const runId = await runSolverRun(lv.id, bfs.id, null);
    const run = await db.run.findUnique({ where: { id: runId } });
    console.log(`solver ${lv.slug}: ${run?.status} moves=${run?.movesUsed} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  // LLM runs (real Thinker plays)
  const llmSlugs = process.argv.slice(2).length ? process.argv.slice(2) : ["07-key-note", "12-wyrm-trial"];
  for (const slug of llmSlugs) {
    const lv = levels.find((l) => l.slug === slug);
    if (!lv) { console.log(`skip ${slug} (not found)`); continue; }
    const existing = await db.run.findFirst({ where: { levelId: lv.id, model: { key: "glm-4.6" } } });
    if (existing) { console.log(`llm ${slug}: exists (${existing.status})`); continue; }
    const t0 = Date.now();
    const runId = await runLlmRun(lv.id, null, undefined);
    const run = await db.run.findUnique({ where: { id: runId } });
    console.log(`llm ${slug}: ${run?.status} moves=${run?.movesUsed} attempts=${run?.attempt} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  console.log("counts:", {
    levels: await db.level.count(),
    runs: await db.run.count(),
    steps: await db.step.count(),
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
