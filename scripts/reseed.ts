// Wipe DB and re-bootstrap with the v2 level ladder + showcase solver runs.
// Fully in-process (no HTTP) so it works regardless of server state.
// Run: bun scripts/reseed.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("wiping…");
  await db.step.deleteMany();
  await db.run.deleteMany();
  await db.cycle.deleteMany();
  await db.level.deleteMany();
  await db.model.deleteMany();
  await db.provider.deleteMany();

  console.log("bootstrapping (in-process)…");
  const { ensureBootstrap, runSolverRun } = await import("../src/lib/wyrm/orchestrator");
  await ensureBootstrap();
  console.log("bootstrap done");

  // showcase: baseline solver runs on the new-mechanic levels
  const levels = await db.level.findMany({ orderBy: { slug: "asc" } });
  const bfs = await db.model.findUnique({ where: { key: "wyrm-bfs" } });
  if (!bfs) throw new Error("no bfs model");

  for (const slug of ["08-slippery-slope", "12-wyrm-trial"]) {
    const lv = levels.find((l) => l.slug === slug);
    if (!lv) continue;
    const t0 = Date.now();
    const runId = await runSolverRun(lv.id, bfs.id, null);
    const run = await db.run.findUnique({ where: { id: runId } });
    console.log(`solver run on ${slug}: status=${run?.status} moves=${run?.movesUsed} (${Date.now() - t0}ms)`);
  }

  const counts = {
    levels: await db.level.count(),
    runs: await db.run.count(),
    steps: await db.step.count(),
  };
  console.log("counts:", counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
