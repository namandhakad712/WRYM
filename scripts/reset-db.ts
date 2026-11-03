// Wipe ALL run/cycle/step/llm data + levels + models, re-bootstrap from scratch.
// "DELETE OF PREVIOUS RUNS" — the arena starts clean; the new 20-level
// ladder (incl. Tier III gauntlet) is re-certified on first boot.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.step.deleteMany();
  await db.llmCall.deleteMany();
  await db.run.deleteMany();
  await db.cycle.deleteMany();
  await db.level.deleteMany();
  await db.model.deleteMany();
  await db.provider.deleteMany();
  console.log("database wiped:", {
    levels: await db.level.count(),
    runs: await db.run.count(),
    steps: await db.step.count(),
    models: await db.model.count(),
    providers: await db.provider.count(),
  });
}

main().finally(() => db.$disconnect());
