import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/wyrm/orchestrator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBootstrap();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
