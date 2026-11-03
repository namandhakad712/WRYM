import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureBootstrap, isCycleRunning, runSolverRun, startLlmRun } from "@/lib/wyrm/orchestrator";

export const dynamic = "force-dynamic";

// GET /api/runs — list runs (newest first)
export async function GET() {
  await ensureBootstrap();
  const runs = await db.run.findMany({
    orderBy: { startedAt: "desc" },
    take: 60,
    include: {
      level: { select: { name: true, slug: true, difficulty: true, minMoves: true, source: true } },
      model: { select: { name: true, key: true, kind: true } },
    },
  });
  return NextResponse.json({ runs });
}

// POST /api/runs — start a run (LLM runs stream into the DB in background)
// body: { levelId: string, modelKey: "glm-4.6" | "wyrm-bfs" }
export async function POST(req: NextRequest) {
  await ensureBootstrap();
  if (isCycleRunning()) {
    return NextResponse.json(
      { error: "an agentic cycle is currently running — wait for it to finish" },
      { status: 409 },
    );
  }
  const body = await req.json().catch(() => null);
  const levelId = body?.levelId as string | undefined;
  const modelKey = (body?.modelKey as string) ?? "glm-4.6";
  if (!levelId) return NextResponse.json({ error: "levelId required" }, { status: 400 });
  if (!["glm-4.6", "wyrm-bfs"].includes(modelKey)) {
    return NextResponse.json({ error: "unknown modelKey" }, { status: 400 });
  }

  const level = await db.level.findUnique({ where: { id: levelId } });
  if (!level) return NextResponse.json({ error: "level not found" }, { status: 404 });

  try {
    if (modelKey === "wyrm-bfs") {
      const solver = await db.model.findUnique({ where: { key: "wyrm-bfs" } });
      const runId = await runSolverRun(levelId, solver!.id, null);
      return NextResponse.json({ runId });
    }
    const runId = await startLlmRun(levelId, null);
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
