import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureBootstrap } from "@/lib/wyrm/orchestrator";
import { validateLevel } from "@/lib/wyrm/validator";
import { createGame, LevelFormatError } from "@/lib/wyrm/engine";

export const dynamic = "force-dynamic";

// GET /api/levels — all levels with run stats
export async function GET() {
  await ensureBootstrap();
  const levels = await db.level.findMany({
    orderBy: [{ source: "desc" }, { createdAt: "asc" }],
    include: {
      runs: {
        select: { id: true, status: true, modelId: true, score: true },
      },
    },
  });
  const models = await db.model.findMany({
    select: { id: true, key: true, name: true, kind: true },
  });
  const modelById = Object.fromEntries(models.map((m) => [m.id, m]));
  return NextResponse.json({
    levels: levels.map((l) => ({
      ...l,
      runCount: l.runs.length,
      solvedBy: [...new Set(l.runs.filter((r) => r.status === "won").map((r) => modelById[r.modelId]?.key))].filter(Boolean),
    })),
  });
}

// POST /api/levels — publish a hand-forged level (from the FORGE editor)
export async function POST(req: NextRequest) {
  await ensureBootstrap();
  const body = await req.json().catch(() => null);
  const grid: unknown = body?.grid;
  const name = String(body?.name ?? "").trim() || "Untitled Forge";
  if (!Array.isArray(grid) || grid.length === 0 || !grid.every((r) => typeof r === "string")) {
    return NextResponse.json({ error: "grid must be an array of strings" }, { status: 400 });
  }

  // must parse
  try {
    createGame({ name, slug: "draft", grid: grid as string[] });
  } catch (e) {
    const msg = e instanceof LevelFormatError ? e.message : (e as Error).message;
    return NextResponse.json({ error: `level does not parse: ${msg}` }, { status: 400 });
  }

  // must be BFS-solvable — nothing unplayable ever enters the arena
  const report = validateLevel({ name, slug: "draft", grid: grid as string[] });
  if (!report.solvable) {
    return NextResponse.json(
      { error: `level is not solvable (${report.reason ?? "no solution exists"}) — the Logic Validator rejected it` },
      { status: 400 },
    );
  }

  const slug =
    `${slugify(name)}-${Date.now().toString(36).slice(-5)}`;

  const created = await db.level.create({
    data: {
      slug,
      name,
      source: "forge",
      grid: (grid as string[]).join("\n"),
      difficulty: report.difficulty,
      minMoves: report.minMoves,
      width: (grid as string[])[0].length,
      height: (grid as string[]).length,
      validated: true,
      validatorJson: JSON.stringify(report),
      genThought: `[forge] hand-built by the operator in the FORGE editor. BFS-certified at difficulty ${report.difficulty}/10.`,
    },
  });
  return NextResponse.json({ level: created });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "forge";
}
