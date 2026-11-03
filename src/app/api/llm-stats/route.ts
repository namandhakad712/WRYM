import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { circuitSnapshotAll, limiterStats } from "@/lib/wyrm/llm/ratelimiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/llm-stats?window=86400 — reliability telemetry for the
 * admin console. Aggregates the LlmCall table over the window and
 * joins live in-process state: circuit-breaker snapshots and
 * sliding-window limiter occupancy.
 */
export async function GET(req: NextRequest) {
  const windowSec = Math.max(60, Math.min(30 * 86400, Number(req.nextUrl.searchParams.get("window")) || 86400));
  const since = new Date(Date.now() - windowSec * 1000);

  const calls = await db.llmCall.findMany({
    where: { ts: { gte: since } },
    orderBy: { ts: "desc" },
    take: 5000,
  });

  const providers = await db.provider.findMany();
  const providerMeta = new Map(
    providers.map((p) => [
      p.name,
      { kind: p.kind, model: p.modelId, role: p.role, rpm: p.rpm, tpm: p.tpm, concurrency: p.concurrency },
    ]),
  );

  // ── totals ─────────────────────────────────────────────────────────
  const totalCalls = calls.length;
  const okCalls = calls.filter((c) => c.ok).length;
  const latencies = calls.filter((c) => c.ok).map((c) => c.latencyMs).sort((a, b) => a - b);
  const p = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : 0);
  const totals = {
    calls: totalCalls,
    okCalls,
    successRate: totalCalls ? okCalls / totalCalls : 1,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p50LatencyMs: p(0.5),
    p95LatencyMs: p(0.95),
    totalRetries: calls.reduce((a, c) => a + c.retries, 0),
    fallbackRescues: calls.filter((c) => c.ok && c.degraded).length,
    rateLimitWaitMs: calls.reduce((a, c) => a + c.rateWaitMs, 0),
    tokensIn: calls.reduce((a, c) => a + c.tokensIn, 0),
    tokensOut: calls.reduce((a, c) => a + c.tokensOut, 0),
    costUsd: calls.reduce((a, c) => a + c.costUsd, 0),
  };

  // ── per provider ───────────────────────────────────────────────────
  const byName = new Map<string, typeof calls>();
  for (const c of calls) {
    const list = byName.get(c.provider) ?? [];
    list.push(c);
    byName.set(c.provider, list);
  }
  const perProvider = [...byName.entries()].map(([name, list]) => {
    const oks = list.filter((c) => c.ok).map((c) => c.latencyMs).sort((a, b) => a - b);
    const meta = providerMeta.get(name);
    return {
      name,
      ...(meta ?? { kind: "custom", model: "?", role: "?", rpm: 0, tpm: 0, concurrency: 0 }),
      calls: list.length,
      okCalls: list.filter((c) => c.ok).length,
      successRate: list.length ? list.filter((c) => c.ok).length / list.length : 1,
      avgLatencyMs: oks.length ? Math.round(oks.reduce((a, b) => a + b, 0) / oks.length) : 0,
      p95LatencyMs: oks.length ? oks[Math.min(oks.length - 1, Math.floor(0.95 * oks.length))] : 0,
      retries: list.reduce((a, c) => a + c.retries, 0),
      fallbackRescues: list.filter((c) => c.ok && c.degraded).length,
      tokens: list.reduce((a, c) => a + c.tokensIn + c.tokensOut, 0),
      costUsd: list.reduce((a, c) => a + c.costUsd, 0),
      lastError: list.find((c) => !c.ok && c.error)?.error ?? null,
    };
  });

  // ── error taxonomy histogram ───────────────────────────────────────
  const errorClasses: Record<string, number> = {};
  for (const c of calls) {
    if (!c.ok && c.errorClass) errorClasses[c.errorClass] = (errorClasses[c.errorClass] ?? 0) + 1;
  }

  // ── recent calls (display slice) ───────────────────────────────────
  const recent = calls.slice(0, 60).map((c) => ({
    id: c.id,
    ts: c.ts,
    role: c.role,
    provider: c.provider,
    model: c.model,
    ok: c.ok,
    degraded: c.degraded,
    attempts: c.attempts,
    retries: c.retries,
    latencyMs: c.latencyMs,
    rateWaitMs: c.rateWaitMs,
    tokensIn: c.tokensIn,
    tokensOut: c.tokensOut,
    errorClass: c.errorClass,
    error: c.error?.slice(0, 160) ?? null,
  }));

  return NextResponse.json({
    windowSec,
    generatedAt: new Date().toISOString(),
    totals,
    perProvider,
    errorClasses,
    circuits: circuitSnapshotAll(),
    limiters: limiterStats(),
    recent,
  });
}
