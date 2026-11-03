// Reset run/cycle/step data (keep levels), reset model stats, re-seed demo run
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.step.deleteMany();
  await db.run.deleteMany();
  await db.cycle.deleteMany();
  await db.level.deleteMany({ where: { source: { not: "handcrafted" } } });
  await db.model.updateMany({
    data: { elo: 1200, runs: 0, wins: 0, losses: 0, totalMoves: 0, totalDeaths: 0 },
  });
  console.log("reset done:", {
    levels: await db.level.count(),
    runs: await db.run.count(),
    steps: await db.step.count(),
  });
}

main().finally(() => db.$disconnect());
