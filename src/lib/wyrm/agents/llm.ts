// ── WYRM.LAB · role → provider resolution (SERVER ONLY) ─────────────
// Agents ask for a ROLE ("thinker", "levelThinker", "reviewer",
// "checker"); this layer resolves the admin-configured Provider rows
// into an ordered FAILover CHAIN:
//
//   primary (highest priority for the role)
//     → its fallback → the fallback's fallback … (≤ 4 hops, cycle-safe)
//     → built-in sandbox model (always last, zero-config)
//
// Every logical call is written to the LlmCall telemetry table —
// success, retries, rate-limit waits, fallback rescues, token spend —
// which powers the admin Reliability panel. Calls can stream deltas
// (live thinking) and be aborted (operator INTERRUPT).

import { db } from "@/lib/db";
import { llmChat } from "../llm/client";
import type { ChatMsg, LLMResult, LLMTarget, ProviderKind } from "../llm/types";
import { PROVIDER_KINDS } from "../llm/types";
import type { Prisma } from "@prisma/client";

export type AgentRole = "thinker" | "levelThinker" | "reviewer" | "checker";

export const ROLE_META: Record<AgentRole, { label: string; blurb: string }> = {
  thinker: { label: "Thinker", blurb: "Plays the game turn by turn — reads the ASCII board, reasons, picks actions." },
  levelThinker: { label: "New Level Thinker", blurb: "Designs original puzzle levels, mentally simulates solutions." },
  reviewer: { label: "Reviewer", blurb: "Critiques finished runs: planning, spatial reasoning, efficiency." },
  checker: { label: "Checker", blurb: "Deterministic replay certification (non-LLM by nature, LLM optional for notes)." },
};

type ProviderRow = Prisma.ProviderGetPayload<object>;

/** Map a Provider DB row → a fully-armed LLMTarget. */
function rowToTarget(row: ProviderRow): LLMTarget {
  return {
    name: row.name,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    modelId: row.modelId,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    contextWindow: row.contextWindow ?? 0,
    rpm: row.rpm ?? 0,
    tpm: row.tpm ?? 0,
    concurrency: row.concurrency ?? 0,
    timeoutMs: row.timeoutMs ?? 0,
    maxRetries: row.maxRetries ?? 0,
    retryBaseMs: row.retryBaseMs ?? 0,
    costPerMtok: row.costPerMtok ?? 0,
  };
}

/** The zero-config default brain bundled with the sandbox. */
export function builtInTarget(): LLMTarget {
  return {
    name: "Built-in (GLM)",
    kind: "zai",
    baseUrl: "",
    apiKey: "",
    modelId: "glm-4.6",
    temperature: 0.4,
    maxTokens: 1024,
  };
}

/**
 * Resolve the ordered failover chain for a role:
 * primary (priority desc) → fallback links (≤ 4, cycle-safe, enabled only).
 * The built-in model is appended when the chain doesn't already end with it.
 */
export async function resolveChain(role: AgentRole): Promise<{ chain: LLMTarget[]; primary: ProviderRow | null }> {
  const rows = await db.provider.findMany({
    where: { role, enabled: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  if (rows.length === 0) return { chain: [builtInTarget()], primary: null };

  const byId = new Map(rows.map((r) => [r.id, r]));
  // fallback links may point at providers bound to OTHER roles — pull them in
  const seen = new Set<string>();
  const chain: LLMTarget[] = [];
  let cursor: ProviderRow | undefined = rows[0];
  const allRows = await db.provider.findMany();
  const allById = new Map(allRows.map((r) => [r.id, r]));

  while (cursor && chain.length < 4) {
    if (seen.has(cursor.id)) break; // cycle guard
    seen.add(cursor.id);
    if (cursor.enabled) chain.push(rowToTarget(cursor));
    const nextId = cursor.fallbackId ?? undefined;
    cursor = nextId ? allById.get(nextId) : undefined;
    if (cursor && !cursor.enabled) cursor = undefined;
  }

  // documented invariant: the built-in model is the FINAL last resort.
  // A fully dead vendor stack degrades (flagged `degraded` in telemetry
  // and the sandbox audit) instead of killing the run.
  if (!chain.some((t) => t.kind === "zai")) chain.push(builtInTarget());

  const primary = rows[0];
  return { chain, primary };
}

/** Legacy single-target resolution (kept for scripts). */
export async function resolveTarget(role: AgentRole): Promise<LLMTarget | null> {
  const { chain } = await resolveChain(role);
  const first = chain[0];
  if (!first || first.name === "Built-in (GLM)") return null;
  return first;
}

export interface ChatOptions {
  role?: AgentRole;
  maxTokens?: number;
  retries?: number;
  signal?: AbortSignal;
  onDelta?: (d: { text?: string; thinking?: string }) => void;
}

/** Persist one telemetry row per logical call (never blocks on failure). */
async function logCall(role: string, res: LLMResult): Promise<void> {
  try {
    const primaryRetries = (res.attempts ?? []).filter((a) => !a.degraded).length - 1;
    await db.llmCall.create({
      data: {
        role,
        provider: res.provider,
        model: res.model,
        ok: res.ok,
        degraded: res.degraded ?? false,
        attempts: (res.attempts ?? []).length || 1,
        retries: Math.max(0, primaryRetries),
        rateWaitMs: res.rateWaitMs ?? 0,
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn ?? 0,
        tokensOut: res.tokensOut ?? 0,
        costUsd: res.costUsd ?? 0,
        errorClass: res.errorClass ?? null,
        error: res.error?.slice(0, 400) ?? null,
        detail: res.attempts ? JSON.stringify(res.attempts).slice(0, 8000) : null,
      },
    });
  } catch {
    /* telemetry must never break the pipeline */
  }
}

/** Role-based chat with the full failover chain + telemetry. */
export async function chat(messages: ChatMsg[], opts: ChatOptions = {}): Promise<LLMResult> {
  const role = opts.role ?? "thinker";
  const { chain } = await resolveChain(role);
  let target = chain[0];
  const fallbacks = chain.slice(1);
  if (opts.maxTokens) target = { ...target, maxTokens: opts.maxTokens };

  const res = await llmChat(target, messages, {
    signal: opts.signal,
    onDelta: opts.onDelta,
    retries: opts.retries,
    fallbacks,
    role,
  });

  // cost tracking against the provider that actually answered
  const totalTokens = (res.tokensIn ?? 0) + (res.tokensOut ?? 0);
  if (res.ok && totalTokens > 0) {
    try {
      const row = await db.provider.findUnique({ where: { name: res.provider } });
      const perMtok = row?.costPerMtok ?? 0;
      if (perMtok > 0) res.costUsd = (totalTokens / 1_000_000) * perMtok;
    } catch {
      /* non-fatal */
    }
  }

  // live health — honest per-provider semantics:
  //   ok       = this provider answered itself
  //   degraded = this provider answered as a FALLBACK for someone else
  //   error    = this provider failed on the wire
  try {
    const failedProviders = [...new Set((res.attempts ?? []).filter((a) => !a.ok && !a.skipped).map((a) => a.provider))];
    for (const fp of failedProviders) {
      const own = (res.attempts ?? []).find((a) => a.provider === fp && !a.ok && !a.skipped);
      await db.provider.updateMany({
        where: { name: fp },
        data: {
          lastStatus: "error",
          lastError: (own?.error ?? "failed").slice(0, 300),
          lastLatencyMs: own?.latencyMs ?? res.latencyMs,
        },
      });
    }
    if (res.ok) {
      await db.provider.updateMany({
        where: { name: res.provider, lastStatus: { not: "error" } },
        data: {
          lastStatus: res.degraded ? "degraded" : "ok",
          lastError: null,
          lastLatencyMs: res.latencyMs,
        },
      });
    }
  } catch {
    /* non-fatal */
  }

  await logCall(role, res);
  return res;
}

/** Extract the first JSON object from an LLM reply (handles fences/prose). */
export function extractJson<T>(text: string): T | null {
  // strip markdown fences
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  // direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* keep digging */
  }
  // first balanced {...} scan
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
