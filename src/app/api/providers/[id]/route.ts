import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { circuitReset } from "@/lib/wyrm/llm/ratelimiter";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function clampInt(v: unknown, lo: number, hi: number): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// PATCH /api/providers/:id — update (empty apiKey ⇒ keep the stored one)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const existing = await db.provider.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // manual circuit-breaker reset
  if (body.resetCircuit === true) circuitReset(existing.name);

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.modelId === "string" && body.modelId.trim()) data.modelId = body.modelId.trim();
  if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl.trim();
  if (typeof body.apiKey === "string" && body.apiKey.trim()) data.apiKey = body.apiKey.trim();
  if (typeof body.role === "string" && ["thinker", "levelThinker", "reviewer", "checker"].includes(body.role)) data.role = body.role;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 500) || null;
  if (body.temperature !== undefined) data.temperature = Math.max(0, Math.min(2, Number(body.temperature) || 0.4));
  if (body.maxTokens !== undefined) data.maxTokens = clampInt(body.maxTokens, 64, 200_000) ?? 1024;

  // ── resilience block ────────────────────────────────────────────────
  if (body.contextWindow !== undefined) data.contextWindow = clampInt(body.contextWindow, 0, 10_000_000) ?? 0;
  if (body.rpm !== undefined) data.rpm = clampInt(body.rpm, 0, 10_000) ?? 0;
  if (body.tpm !== undefined) data.tpm = clampInt(body.tpm, 0, 100_000_000) ?? 0;
  if (body.concurrency !== undefined) data.concurrency = clampInt(body.concurrency, 0, 256) ?? 0;
  if (body.timeoutMs !== undefined) data.timeoutMs = clampInt(body.timeoutMs, 0, 3_600_000) ?? 0;
  if (body.maxRetries !== undefined) data.maxRetries = clampInt(body.maxRetries, 0, 10) ?? 0;
  if (body.retryBaseMs !== undefined) data.retryBaseMs = clampInt(body.retryBaseMs, 0, 120_000) ?? 0;
  if (body.priority !== undefined) data.priority = clampInt(body.priority, -1000, 1000) ?? 0;
  if (body.costPerMtok !== undefined) data.costPerMtok = Math.max(0, Math.min(10_000, Number(body.costPerMtok) || 0));

  // fallback link: null clears, string sets (must exist, must not be self)
  if (body.fallbackId !== undefined) {
    if (body.fallbackId === null || body.fallbackId === "") {
      data.fallbackId = null;
    } else if (body.fallbackId === id) {
      return NextResponse.json({ error: "a provider cannot be its own fallback" }, { status: 400 });
    } else {
      const fb = await db.provider.findUnique({ where: { id: String(body.fallbackId) } });
      if (!fb) return NextResponse.json({ error: "fallback provider not found" }, { status: 400 });
      data.fallbackId = fb.id;
    }
  }

  const updated = await db.provider.update({ where: { id }, data });
  return NextResponse.json({ provider: { ...updated, apiKey: maskKey(updated.apiKey) } });
}

// DELETE /api/providers/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // clear any fallback links pointing at this provider first
    await db.provider.updateMany({ where: { fallbackId: id }, data: { fallbackId: null } });
    await db.provider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
