import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureBootstrap } from "@/lib/wyrm/orchestrator";

export const dynamic = "force-dynamic";

// GET /api/models — the Elo leaderboard + global stats
export async function GET() {
  await ensureBootstrap();
  const models = await db.model.findMany({ orderBy: { elo: "desc" } });
  const [cycles, levels, runs, steps] = await Promise.all([
    db.cycle.count(),
    db.level.count(),
    db.run.count(),
    db.step.count(),
  ]);
  const llmRuns = await db.run.count({ where: { model: { key: "glm-4.6" } } });
  const llmWins = await db.run.count({ where: { model: { key: "glm-4.6" }, status: "won" } });
  return NextResponse.json({
    models,
    stats: { cycles, levels, runs, steps, llmRuns, llmWins },
  });
}
