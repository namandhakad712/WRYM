import { NextRequest, NextResponse } from "next/server";
import { validateLevel } from "@/lib/wyrm/validator";
import { createGame, LevelFormatError } from "@/lib/wyrm/engine";
import { renderAscii } from "@/lib/wyrm/ascii";
import type { LevelDef } from "@/lib/wyrm/types";

export const dynamic = "force-dynamic";

// POST /api/levels/validate — BFS-certify a draft level from the FORGE editor
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const grid: unknown = body?.grid;
  if (!Array.isArray(grid) || grid.length === 0 || !grid.every((r) => typeof r === "string")) {
    return NextResponse.json({ error: "grid must be an array of strings" }, { status: 400 });
  }

  const level: LevelDef = {
    name: String(body?.name ?? "Draft"),
    slug: "draft",
    grid: grid as string[],
  };

  let initialState;
  try {
    initialState = createGame(level);
  } catch (e) {
    const msg = e instanceof LevelFormatError ? e.message : (e as Error).message;
    return NextResponse.json({ parseError: msg, ascii: (grid as string[]).join("\n") });
  }

  const report = validateLevel(level);
  return NextResponse.json({
    parseError: null,
    ascii: renderAscii(initialState),
    report,
  });
}
