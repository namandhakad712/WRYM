import { NextRequest, NextResponse } from "next/server";
import { control } from "@/lib/wyrm/runcontrol";

export const dynamic = "force-dynamic";

// POST /api/control/:runId — operator control plane
// body: { op: "pause" | "resume" | "steer" | "interrupt", text?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = await req.json().catch(() => ({}));
  const op = body?.op as string | undefined;
  const text = typeof body?.text === "string" ? body.text : undefined;

  if (op !== "pause" && op !== "resume" && op !== "steer" && op !== "interrupt") {
    return NextResponse.json({ error: "op must be pause | resume | steer | interrupt" }, { status: 400 });
  }
  if (op === "steer" && (!text || !text.trim())) {
    return NextResponse.json({ error: "steer needs a text payload" }, { status: 400 });
  }

  const result = control(runId, op, text);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
