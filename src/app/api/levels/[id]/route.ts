import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/levels/:id — single level detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const level = await db.level.findUnique({
    where: { id },
    include: { runs: { orderBy: { startedAt: "desc" } } },
  });
  if (!level) return NextResponse.json({ error: "level not found" }, { status: 404 });
  return NextResponse.json({ level });
}
