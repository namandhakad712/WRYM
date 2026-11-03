import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureBootstrap, isCycleRunning, runCycle, runAutoLoop } from "@/lib/wyrm/orchestrator";

export const dynamic = "force-dynamic";

// GET /api/cycles — list cycles with their levels
export async function GET() {
  await ensureBootstrap();
  const cycles = await db.cycle.findMany({
    orderBy: { index: "desc" },
    take: 40,
    include: { level: { select: { name: true, slug: true, difficulty: true, minMoves: true, source: true } } },
  });
  const runs = await db.run.findMany({
    orderBy: { startedAt: "desc" },
    take: 80,
    include: {
      level: { select: { name: true, slug: true, difficulty: true, minMoves: true, source: true } },
      model: { select: { name: true, key: true, kind: true } },
    },
  });
  return NextResponse.json({ cycles, runs, running: isCycleRunning() });
}

// POST /api/cycles — run agentic cycle(s) in the background
// body: { count?: number (1-5), genMode?: "llm" | "procedural" }
export async function POST(req: NextRequest) {
  await ensureBootstrap();
  if (isCycleRunning()) {
    return NextResponse.json({ error: "a cycle is already running" }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const count = Math.max(1, Math.min(5, Number(body?.count ?? 1)));
  const genMode = body?.genMode === "procedural" ? "procedural" : "llm";

  // fire and forget; the client polls GET /api/cycles
  const task = count === 1 ? runCycle({ genMode }) : runAutoLoop(count, genMode);
  void task.catch((e) => console.error("[wyrm] cycle failed:", e));

  return NextResponse.json({ started: true, count, genMode });
}
