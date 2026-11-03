import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PROVIDER_KINDS, PROVIDER_KIND_LIST } from "@/lib/wyrm/llm/types";
import type { ProviderKind } from "@/lib/wyrm/llm/types";

export const dynamic = "force-dynamic";

/** Mask a key for client display: only the last 4 chars survive. */
function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export function clampInt(v: unknown, lo: number, hi: number, dflt = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// GET /api/providers — all provider configs (keys masked) + kind registry
export async function GET() {
  const rows = await db.provider.findMany({
    orderBy: { createdAt: "asc" },
    include: { fallback: { select: { id: true, name: true } } },
  });
  return NextResponse.json({
    providers: rows.map((p) => ({ ...p, apiKey: maskKey(p.apiKey) })),
    kinds: PROVIDER_KIND_LIST.map((k) => ({ kind: k, ...PROVIDER_KINDS[k] })),
  });
}

// POST /api/providers — create a config
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const kind = body.kind as ProviderKind;
  if (!PROVIDER_KIND_LIST.includes(kind)) {
    return NextResponse.json({ error: `unknown kind '${kind}'` }, { status: 400 });
  }
  const meta = PROVIDER_KINDS[kind];
  if (meta.needsKey && !body.apiKey) {
    return NextResponse.json({ error: `${meta.label} requires an API key` }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const modelId = String(body.modelId ?? "").trim();
  const baseUrl = String(body.baseUrl ?? meta.defaultBaseUrl).trim();
  const role = ["thinker", "levelThinker", "reviewer", "checker"].includes(body.role) ? body.role : "thinker";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!modelId) return NextResponse.json({ error: "model id required" }, { status: 400 });
  if (kind !== "zai" && !baseUrl) return NextResponse.json({ error: "base URL required" }, { status: 400 });

  const dup = await db.provider.findUnique({ where: { name } });
  if (dup) return NextResponse.json({ error: `a provider named "${name}" already exists` }, { status: 409 });

  // fallback link must exist and not be self
  let fallbackId: string | null = null;
  if (body.fallbackId) {
    const fb = await db.provider.findUnique({ where: { id: String(body.fallbackId) } });
    if (!fb) return NextResponse.json({ error: "fallback provider not found" }, { status: 400 });
    fallbackId = fb.id;
  }

  const created = await db.provider.create({
    data: {
      name,
      kind,
      baseUrl,
      apiKey: String(body.apiKey ?? ""),
      modelId,
      role,
      temperature: clampNum(body.temperature ?? 0.4, 0, 2),
      maxTokens: clampInt(body.maxTokens ?? 1024, 64, 200_000),
      enabled: body.enabled !== false,
      // ── resilience block ───────────────────────────────────────────
      contextWindow: clampInt(body.contextWindow ?? 0, 0, 10_000_000),
      rpm: clampInt(body.rpm ?? 0, 0, 10_000),
      tpm: clampInt(body.tpm ?? 0, 0, 100_000_000),
      concurrency: clampInt(body.concurrency ?? 0, 0, 256),
      timeoutMs: clampInt(body.timeoutMs ?? 0, 0, 3_600_000),
      maxRetries: clampInt(body.maxRetries ?? 0, 0, 10),
      retryBaseMs: clampInt(body.retryBaseMs ?? 0, 0, 120_000),
      priority: clampInt(body.priority ?? 0, -1000, 1000),
      costPerMtok: clampNum(body.costPerMtok ?? 0, 0, 10_000),
      fallbackId,
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
    },
  });
  return NextResponse.json({ provider: { ...created, apiKey: maskKey(created.apiKey) } });
}

function clampNum(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n * 10000) / 10000));
}
