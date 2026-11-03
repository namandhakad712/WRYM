// Pull live statistics from the DB for the white paper.
// Run: bun scripts/paper-stats.ts
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const levels = await db.level.findMany({ orderBy: { slug: "asc" } });
const runs = await db.run.findMany({ include: { level: true, model: true } });
const steps = await db.step.count();
const models = await db.model.findMany();

console.log("== LEVELS ==");
for (const l of levels) {
  const v = JSON.parse(l.validatorJson ?? "{}");
  console.log(
    `${l.slug} | ${l.name} | d=${l.difficulty} | min=${l.minMoves} | states=${v.statesExplored ?? "?"} | mech=${l.mechanics} | turnLimit=${l.turnLimit} | ${l.width}x${l.height}`,
  );
}
console.log("\n== RUNS ==");
for (const r of runs) {
  console.log(`${r.level.slug} | ${r.model.key} | ${r.status} | moves=${r.movesUsed} | checker=${r.checkerVerdict}`);
}
console.log("\n== TOTALS ==");
console.log(`levels=${levels.length} runs=${runs.length} steps=${steps} models=${models.length}`);
for (const m of models) console.log(`model ${m.key}: elo=${m.elo} runs=${m.runs} wins=${m.wins}`);
const llmRun = runs.find((r) => r.model.key === "glm-4.6");
if (llmRun) {
  const st = await db.step.findMany({ where: { runId: llmRun.id }, orderBy: { turn: "asc" } });
  console.log(`\nllm partial run: ${st.length} steps, ${st.filter((s) => s.valid).length} valid, thoughts on ${st.filter((s) => s.thought).length}`);
}

await db.$disconnect();
