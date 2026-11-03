import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/runs/:id — full run detail incl. every recorded step
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await db.run.findUnique({
    where: { id },
    include: {
      level: true,
      model: { select: { name: true, key: true, kind: true, elo: true } },
      steps: { orderBy: { turn: "asc" } },
    },
  });
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  return NextResponse.json({ run });
}
