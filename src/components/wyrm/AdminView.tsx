"use client";

// ── WYRM.LAB · ADMIN — the LLM control console ───────────────────────
// pi-style provider management: add any endpoint (OpenAI, Anthropic,
// Google, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Ollama,
// LM Studio, or any custom OpenAI-compatible server), assign it to an
// agent role, and configure the FULL reliability stack per provider:
// context window, RPM/TPM/concurrency limits, timeout, retry budget,
// backoff base, fallback chain, priority and cost tracking.
//
// The Reliability panel below the endpoint list shows live telemetry
// from every model call the arena makes: success rates, latency
// percentiles, retries, fallback rescues, rate-limit waits, circuit
// breaker states and the error taxonomy. Keys are stored server-side
// and never rendered in full.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Settings2,
  Plus,
  KeyRound,
  Trash2,
  Plug,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  Server,
  Bot,
  ShieldCheck,
  Info,
  Activity,
  Gauge,
  RotateCcw,
  Zap,
  Timer,
  Coins,
  ArrowRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface KindMeta {
  kind: string;
  label: string;
  protocol: string;
  defaultBaseUrl: string;
  needsKey: boolean;
  keyPattern?: string;
  modelHint: string;
  note: string;
  contextHint: number;
}

interface ProviderRow {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string; // masked
  modelId: string;
  temperature: number;
  maxTokens: number;
  role: string;
  enabled: boolean;
  contextWindow: number;
  rpm: number;
  tpm: number;
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  priority: number;
  costPerMtok: number;
  fallbackId: string | null;
  fallback?: { id: string; name: string } | null;
  lastStatus: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  updatedAt: string;
}

interface CircuitSnapshot {
  state: "closed" | "open" | "half-open";
  failures: number;
  until: number;
  lastClass?: string;
  lastError?: string;
  totalTrips: number;
  cooldownRemainingMs: number;
}

interface LlmStats {
  windowSec: number;
  totals: {
    calls: number;
    okCalls: number;
    successRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalRetries: number;
    fallbackRescues: number;
    rateLimitWaitMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  perProvider: {
    name: string;
    kind: string;
    model: string;
    calls: number;
    successRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    retries: number;
    fallbackRescues: number;
    tokens: number;
    costUsd: number;
  }[];
  errorClasses: Record<string, number>;
  circuits: Record<string, CircuitSnapshot>;
  limiters: Record<string, { rpmUsed: number; tpmUsed: number; inflight: number; waitedMs: number }>;
  recent: {
    id: string;
    ts: string;
    role: string;
    provider: string;
    model: string;
    ok: boolean;
    degraded: boolean;
    attempts: number;
    latencyMs: number;
    rateWaitMs: number;
    tokensIn: number;
    tokensOut: number;
    errorClass: string | null;
    error: string | null;
  }[];
}

const ROLES = [
  { id: "thinker", label: "Thinker", desc: "plays the game" },
  { id: "levelThinker", label: "Level Thinker", desc: "designs levels" },
  { id: "reviewer", label: "Reviewer", desc: "critiques runs" },
  { id: "checker", label: "Checker", desc: "certifies replays" },
];

const ROLE_COLORS: Record<string, string> = {
  thinker: "text-primary border-primary/40 bg-primary/10",
  levelThinker: "text-violet-800 border-violet-900/30 bg-violet-900/5",
  reviewer: "text-teal-900 border-teal-900/30 bg-teal-900/5",
  checker: "text-emerald-800 border-emerald-400/40 bg-emerald-700/10",
};

const ERROR_LABELS: Record<string, string> = {
  rate_limit: "rate limit",
  quota: "quota",
  auth: "auth",
  context: "context",
  server: "server",
  network: "network",
  timeout: "timeout",
  invalid: "invalid",
  aborted: "interrupt",
  unknown: "unknown",
};

const fmtMs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export function AdminView() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [statsWindow, setStatsWindow] = useState(86400);

  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async (): Promise<{ providers: ProviderRow[]; kinds: KindMeta[] }> => {
      const r = await fetch("/api/providers");
      return r.json();
    },
    refetchInterval: 15000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["llm-stats", statsWindow],
    queryFn: async (): Promise<LlmStats> => {
      const r = await fetch(`/api/llm-stats?window=${statsWindow}`);
      return r.json();
    },
    refetchInterval: 8000,
  });

  const providers = data?.providers ?? [];
  const kinds = data?.kinds ?? [];
  const kindMeta = (k: string) => kinds.find((x) => x.kind === k);

  const test = useCallback(
    async (p: ProviderRow) => {
      setTesting(p.id);
      try {
        const r = await fetch(`/api/providers/${p.id}/test`, { method: "POST" });
        const j = await r.json();
        if (j.ok) {
          toast({
            title: `${j.provider} responded — ${j.latencyMs}ms`,
            description: `${j.attempts?.length ?? 1} attempt${j.attempts?.length === 1 ? "" : "s"}${j.degraded ? ` · rescued via fallback (${p.name} failed over)` : ""} · replied “${(j.reply ?? "").slice(0, 40) || "…"}”`,
          });
        } else {
          toast({
            title: `${p.name} failed${j.degraded ? " — fallback also failed" : ""}`,
            description: `[${ERROR_LABELS[j.errorClass] ?? "error"}] ${j.error ?? "unknown error"}`,
            variant: "destructive",
          });
        }
      } finally {
        setTesting(null);
        qc.invalidateQueries({ queryKey: ["providers"] });
        qc.invalidateQueries({ queryKey: ["llm-stats"] });
      }
    },
    [qc],
  );

  const remove = useCallback(
    async (p: ProviderRow) => {
      await fetch(`/api/providers/${p.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast({ title: "provider removed", description: `${p.name} is gone. Roles fall back to the built-in model.` });
    },
    [qc],
  );

  const toggle = useCallback(
    async (p: ProviderRow, enabled: boolean) => {
      await fetch(`/api/providers/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      qc.invalidateQueries({ queryKey: ["providers"] });
    },
    [qc],
  );

  const resetCircuit = useCallback(
    async (name: string) => {
      const p = providers.find((x) => x.name === name);
      if (!p) return;
      await fetch(`/api/providers/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetCircuit: true }),
      });
      qc.invalidateQueries({ queryKey: ["llm-stats"] });
      toast({ title: "circuit breaker reset", description: `${name} is closed and will be probed on the next call.` });
    },
    [providers, qc],
  );

  const roleAssignment = (role: string) => providers.find((p) => p.role === role && p.enabled);
  const circuitOf = (name: string) => stats?.circuits?.[name];

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" /> admin · llm control console
          </div>
          <h1 className="display-1 mt-1.5 text-3xl text-foreground sm:text-4xl">
            Plug in <span className="text-glow-accent">any brain</span>, keep the arena alive
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            One uniform adapter (pi-style) drives every provider — any vendor, any base URL, any model, including local
            Ollama / LM Studio and fully custom OpenAI-compatible gateways. Each endpoint carries its own reliability
            contract: context window, rate limits, retries, timeouts and a fallback chain — a dying provider never
            kills a benchmark run.
          </p>
        </div>
        <Button
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add provider
        </Button>
      </div>

      {/* role map */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROLES.map((r) => {
          const p = roleAssignment(r.id);
          return (
            <div key={r.id} className="panel card-lift rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className={cn("live-pill border", ROLE_COLORS[r.id])}>
                  <Bot className="h-3 w-3" /> {r.label.toUpperCase()}
                </span>
                <span className={cn("h-2 w-2 rounded-full", p ? "bg-emerald-600 shadow-[0_0_8px] shadow-emerald-600" : "bg-muted-foreground/40")} />
              </div>
              <div className="mt-2.5 truncate font-display text-[14px] font-semibold text-foreground">
                {p ? p.name : "Built-in (GLM)"}
              </div>
              <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10.5px] text-muted-foreground">
                {p ? (
                  <>
                    <span className="truncate">{p.modelId}</span>
                    {p.fallback && (
                      <>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.fallback.name}</span>
                      </>
                    )}
                  </>
                ) : (
                  "zero-config fallback"
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* provider list */}
      <div className="panel rounded-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <span className="eyebrow flex items-center gap-2"><Server className="h-3.5 w-3.5" /> configured endpoints</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">{providers.length} total</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> loading…
          </div>
        ) : providers.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-display text-[15px] font-semibold text-foreground">No providers configured yet</p>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              The pipeline currently runs on the built-in model. Add an OpenAI, Anthropic, Google, OpenRouter, Groq,
              DeepSeek, Mistral, xAI, Together, Ollama, LM Studio or custom endpoint to take control of any agent role.
            </p>
            <Button className="mt-4 gap-1.5" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first provider
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {providers.map((p) => {
              const meta = kindMeta(p.kind);
              const circuit = circuitOf(p.name);
              const openCircuit = circuit?.state === "open";
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-4"
                >
                  {/* status dot */}
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      p.lastStatus === "ok" && "bg-emerald-600",
                      p.lastStatus === "degraded" && "bg-chart-3",
                      p.lastStatus === "error" && "bg-red-700",
                      !p.lastStatus && "bg-muted-foreground/40",
                      openCircuit && "animate-pulse bg-red-700",
                    )}
                    title={
                      p.lastStatus === "degraded"
                        ? "answered as a fallback for another provider"
                        : p.lastStatus ?? "never tested"
                    }
                  />
                  {/* name + model */}
                  <div className="min-w-[180px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[14px] font-semibold text-foreground">{p.name}</span>
                      <span className="rounded border border-border/70 bg-secondary/50 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                        {meta?.label ?? p.kind}
                      </span>
                      <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider", ROLE_COLORS[p.role])}>
                        {p.role}
                      </span>
                      {p.fallback && (
                        <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          <ArrowRight className="h-3 w-3" /> {p.fallback.name}
                        </span>
                      )}
                      {openCircuit && (
                        <span className="stamp stamp-invalid scale-90">breaker open</span>
                      )}
                      {!p.enabled && <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground/60">disabled</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-muted-foreground">
                      <span className="text-foreground/80">{p.modelId}</span>
                      <span>·</span>
                      <span className="truncate">{p.baseUrl || "built-in"}</span>
                      <span>·</span>
                      <span>key {p.apiKey || "—"}</span>
                      <span>·</span>
                      <span title="context window">
                        ctx {p.contextWindow ? fmtTokens(p.contextWindow) : `auto${meta?.contextHint ? ` (${fmtTokens(meta.contextHint)})` : ""}`}
                      </span>
                      {(p.rpm > 0 || p.tpm > 0) && (
                        <>
                          <span>·</span>
                          <span title="rate limits">{p.rpm > 0 ? `${p.rpm} rpm` : ""}{p.rpm > 0 && p.tpm > 0 ? " / " : ""}{p.tpm > 0 ? `${fmtTokens(p.tpm)} tpm` : ""}</span>
                        </>
                      )}
                      {p.lastLatencyMs != null && (
                        <>
                          <span>·</span>
                          <span className={p.lastStatus === "ok" ? "text-emerald-800" : "text-red-800"}>{p.lastLatencyMs}ms</span>
                        </>
                      )}
                    </div>
                    {p.lastStatus === "error" && p.lastError && (
                      <div className="mt-1 truncate font-mono text-[10px] text-red-800">{p.lastError}</div>
                    )}
                  </div>
                  {/* actions */}
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11.5px]" onClick={() => test(p)} disabled={testing === p.id}>
                      {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-[11.5px]"
                      onClick={() => {
                        setEditing(p);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Switch checked={p.enabled} onCheckedChange={(v) => toggle(p, v)} aria-label="enable provider" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-700" onClick={() => remove(p)} aria-label="delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── reliability telemetry ─────────────────────────────────────── */}
      <ReliabilityPanel
        stats={stats}
        loading={statsLoading}
        windowSec={statsWindow}
        onWindow={setStatsWindow}
        onResetCircuit={resetCircuit}
      />

      {/* security note */}
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-glow-accent" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Keys are stored server-side in the lab database and never sent back to the browser in full (only a mask).
          All provider calls happen on the server; the browser only ever sees streamed deltas and results. Retries,
          rate limiting and fallbacks also run server-side — the model under test can never observe or influence them.
        </p>
      </div>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kinds={kinds}
        providers={providers}
        editing={editing}
        onSaved={() => {
          setDialogOpen(false);
          qc.invalidateQueries({ queryKey: ["providers"] });
        }}
      />
    </div>
  );
}

// ── reliability telemetry panel ──────────────────────────────────────
function ReliabilityPanel({
  stats,
  loading,
  windowSec,
  onWindow,
  onResetCircuit,
}: {
  stats?: LlmStats;
  loading: boolean;
  windowSec: number;
  onWindow: (s: number) => void;
  onResetCircuit: (name: string) => void;
}) {
  const t = stats?.totals;
  const windows: [number, string][] = [
    [3600, "1h"],
    [86400, "24h"],
    [7 * 86400, "7d"],
  ];

  const statCards = t
    ? [
        { label: "success rate", value: `${(t.successRate * 100).toFixed(1)}%`, sub: `${t.okCalls}/${t.calls} calls`, warn: t.calls > 0 && t.successRate < 0.9 },
        { label: "latency p50 / p95", value: `${fmtMs(t.p50LatencyMs)} / ${fmtMs(t.p95LatencyMs)}`, sub: `avg ${fmtMs(t.avgLatencyMs)}` },
        { label: "retries", value: `${t.totalRetries}`, sub: "same-provider backoff" },
        { label: "fallback rescues", value: `${t.fallbackRescues}`, sub: "degraded but alive", warn: false },
        { label: "rate-limit wait", value: fmtMs(t.rateLimitWaitMs), sub: "limiter + Retry-After" },
        { label: "tokens moved", value: fmtTokens(t.tokensIn + t.tokensOut), sub: `${fmtTokens(t.tokensIn)} in · ${fmtTokens(t.tokensOut)} out` },
        { label: "est. spend", value: t.costUsd > 0 ? `$${t.costUsd.toFixed(2)}` : "—", sub: "from cost/Mtok fields" },
      ]
    : [];

  const errorEntries = Object.entries(stats?.errorClasses ?? {}).sort((a, b) => b[1] - a[1]);
  const errorMax = Math.max(1, ...errorEntries.map(([, n]) => n));

  return (
    <div className="panel rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="eyebrow flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" /> reliability telemetry
        </span>
        <div className="flex items-center gap-1">
          {windows.map(([sec, label]) => (
            <button
              key={sec}
              onClick={() => onWindow(sec)}
              className={cn(
                "rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors",
                windowSec === sec
                  ? "border-foreground/60 bg-secondary text-foreground"
                  : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> collecting telemetry…
        </div>
      ) : !t || t.calls === 0 ? (
        <div className="px-5 py-10 text-center">
          <Gauge className="mx-auto h-7 w-7 text-muted-foreground/50" />
          <p className="mt-3 font-display text-[14.5px] font-semibold text-foreground">No model calls recorded yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
            Every LLM call the arena makes — thinker moves, level design, reviews, connectivity probes — is logged here
            with its full retry, rate-limit and fallback history. Run a cycle and watch it fill in.
          </p>
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            {statCards.map((s) => (
              <div key={s.label} className="panel-inset rounded-lg p-3">
                <div className="eyebrow text-[8.5px]">{s.label}</div>
                <div className={cn("stat-num mt-1 text-[17px] leading-none", s.warn ? "text-glow-accent" : "text-foreground")}>{s.value}</div>
                <div className="mt-1 font-mono text-[9.5px] text-muted-foreground">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* circuit breakers + per-provider stats */}
            <div>
              <div className="eyebrow mb-2 flex items-center gap-2">
                <Zap className="h-3 w-3" /> circuit breakers & providers
              </div>
              <div className="panel-inset divide-y divide-border/50 rounded-lg">
                {(stats?.perProvider ?? []).length === 0 && (
                  <div className="px-3 py-4 font-mono text-[11px] text-muted-foreground">no provider activity in window</div>
                )}
                {(stats?.perProvider ?? []).map((p) => {
                  const c = stats?.circuits?.[p.name];
                  return (
                    <div key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <span
                        className={cn(
                          "stamp scale-[0.82] origin-left",
                          c?.state === "open" && "stamp-invalid",
                          c?.state === "half-open" && "text-chart-3",
                          (!c || c.state === "closed") && "stamp-certified",
                        )}
                        title={c ? `breaker ${c.state} · ${c.failures} consecutive failures · tripped ${c.totalTrips}×` : "breaker closed"}
                      >
                        {c?.state === "open" ? "open" : c?.state === "half-open" ? "probing" : "closed"}
                      </span>
                      <span className="min-w-[110px] flex-1 truncate font-display text-[12.5px] font-semibold">{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {(p.successRate * 100).toFixed(0)}% · {p.calls} calls
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">p95 {fmtMs(p.p95LatencyMs)}</span>
                      {p.retries > 0 && <span className="font-mono text-[10px] text-muted-foreground">{p.retries} retries</span>}
                      {c?.state === "open" && c.cooldownRemainingMs > 0 && (
                        <span className="font-mono text-[10px] text-glow-accent">cooldown {fmtMs(c.cooldownRemainingMs)}</span>
                      )}
                      {c && c.state !== "closed" && (
                        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => onResetCircuit(p.name)}>
                          <RotateCcw className="h-3 w-3" /> reset
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* error taxonomy */}
              {errorEntries.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow mb-2">error taxonomy</div>
                  <div className="panel-inset space-y-1.5 rounded-lg p-3">
                    {errorEntries.map(([cls, n]) => (
                      <div key={cls} className="flex items-center gap-2.5">
                        <span className="w-[86px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {ERROR_LABELS[cls] ?? cls}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn("h-full rounded-full", cls === "quota" || cls === "auth" ? "bg-red-700" : "bg-foreground/70")}
                            style={{ width: `${Math.max(4, (n / errorMax) * 100)}%` }}
                          />
                        </div>
                        <span className="mono-num w-7 shrink-0 text-right font-mono text-[10.5px]">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* recent calls */}
            <div>
              <div className="eyebrow mb-2 flex items-center gap-2">
                <Timer className="h-3 w-3" /> recent calls — full attempt history
              </div>
              <div className="panel-inset wyrm-scroll max-h-[380px] overflow-y-auto rounded-lg">
                <table className="w-full border-collapse">
                  <tbody className="divide-y divide-border/40">
                    {(stats?.recent ?? []).map((c) => (
                      <tr key={c.id} className="align-middle">
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[9.5px] text-muted-foreground">
                          {new Date(c.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          {c.role}
                        </td>
                        <td className="max-w-[110px] truncate px-1.5 py-1.5 font-mono text-[10px] text-foreground/90">{c.provider}</td>
                        <td className="whitespace-nowrap px-1.5 py-1.5">
                          {c.ok ? (
                            <span className={cn("font-mono text-[10px] font-bold", c.degraded ? "text-chart-3" : "text-emerald-800")}>
                              {c.degraded ? "RESCUED" : "OK"}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] font-bold text-red-700">{(ERROR_LABELS[c.errorClass ?? ""] ?? c.errorClass ?? "err").toUpperCase()}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-[9.5px] text-muted-foreground">
                          {c.attempts > 1 ? `${c.attempts}× ` : ""}
                          {fmtMs(c.latencyMs)}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-[9.5px] text-muted-foreground">
                          {fmtTokens(c.tokensIn)}→{fmtTokens(c.tokensOut)}
                        </td>
                        {c.rateWaitMs > 0 && (
                          <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-[9.5px] text-glow-accent">+{fmtMs(c.rateWaitMs)} wait</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fig-caption">
                RESCUED = primary provider failed, fallback chain answered. Attempt logs (backoff, Retry-After,
                circuit skips) are stored per call in the LlmCall table.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── add / edit dialog ────────────────────────────────────────────────
function ProviderDialog({
  open,
  onOpenChange,
  kinds,
  providers,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kinds: KindMeta[];
  providers: ProviderRow[];
  editing: ProviderRow | null;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState("openai");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [role, setRole] = useState("thinker");
  const [temperature, setTemperature] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [saving, setSaving] = useState(false);

  // reliability block
  const [contextWindow, setContextWindow] = useState(0);
  const [rpm, setRpm] = useState(0);
  const [tpm, setTpm] = useState(0);
  const [concurrency, setConcurrency] = useState(0);
  const [timeoutSec, setTimeoutSec] = useState(120);
  const [maxRetries, setMaxRetries] = useState(3);
  const [retryBaseMs, setRetryBaseMs] = useState(800);
  const [priority, setPriority] = useState(0);
  const [costPerMtok, setCostPerMtok] = useState(0);
  const [fallbackId, setFallbackId] = useState<string>("none");

  const meta = kinds.find((k) => k.kind === kind);
  const fallbackOptions = providers.filter((p) => p.id !== editing?.id);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
      setBaseUrl(editing.baseUrl);
      setApiKey(""); // never prefill — server keeps the old one when blank
      setModelId(editing.modelId);
      setRole(editing.role);
      setTemperature(editing.temperature);
      setMaxTokens(editing.maxTokens);
      setContextWindow(editing.contextWindow ?? 0);
      setRpm(editing.rpm ?? 0);
      setTpm(editing.tpm ?? 0);
      setConcurrency(editing.concurrency ?? 0);
      setTimeoutSec(Math.round((editing.timeoutMs || 120000) / 1000));
      setMaxRetries(editing.maxRetries || 3);
      setRetryBaseMs(editing.retryBaseMs || 800);
      setPriority(editing.priority ?? 0);
      setCostPerMtok(editing.costPerMtok ?? 0);
      setFallbackId(editing.fallbackId ?? "none");
    } else {
      setKind("openai");
      setName("");
      setBaseUrl(kinds.find((k) => k.kind === "openai")?.defaultBaseUrl ?? "");
      setApiKey("");
      setModelId("");
      setRole("thinker");
      setTemperature(0.4);
      setMaxTokens(1024);
      setContextWindow(0);
      setRpm(0);
      setTpm(0);
      setConcurrency(0);
      setTimeoutSec(120);
      setMaxRetries(3);
      setRetryBaseMs(800);
      setPriority(0);
      setCostPerMtok(0);
      setFallbackId("none");
    }
  }, [open, editing, kinds]);

  useEffect(() => {
    if (!editing && meta && open) setBaseUrl(meta.defaultBaseUrl);
  }, [kind, meta, editing, open]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        kind,
        baseUrl,
        apiKey,
        modelId,
        role,
        temperature,
        maxTokens,
        contextWindow,
        rpm,
        tpm,
        concurrency,
        timeoutMs: timeoutSec * 1000,
        maxRetries,
        retryBaseMs,
        priority,
        costPerMtok,
        fallbackId: fallbackId === "none" ? null : fallbackId,
      };
      const r = await fetch(editing ? `/api/providers/${editing.id}` : "/api/providers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "could not save", description: j.error, variant: "destructive" });
        return;
      }
      toast({
        title: editing ? "provider updated" : "provider added",
        description: `${j.provider.name} → ${j.provider.role}. Test the connection to verify the whole chain.`,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const numField = (
    label: string,
    value: number,
    set: (n: number) => void,
    placeholder: string,
    opts: { min?: number; max?: number; step?: number; suffix?: string; hint?: string } = {},
  ) => (
    <div className="space-y-1">
      <Label className="text-[11px] leading-tight">
        {label}
        {opts.suffix && <span className="ml-1 font-normal text-muted-foreground">({opts.suffix})</span>}
      </Label>
      <Input
        type="number"
        value={value}
        min={opts.min ?? 0}
        max={opts.max}
        step={opts.step ?? 1}
        onChange={(e) => set(Number(e.target.value) || 0)}
        placeholder={placeholder}
        className="h-8 font-mono text-[11.5px]"
      />
      {opts.hint && <p className="font-mono text-[9px] leading-tight text-muted-foreground">{opts.hint}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wyrm-scroll max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="display-2 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-glow-accent" />
            {editing ? "Edit provider" : "Add LLM provider"}
          </DialogTitle>
          <DialogDescription>
            Any endpoint, any model — plus its reliability contract: limits, retries, fallback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* kind grid */}
          <div>
            <Label className="mb-2 text-[12px]">Provider kind</Label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {kinds.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => setKind(k.kind)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-all",
                    kind === k.kind
                      ? "border-foreground/70 bg-secondary shadow-[0_2px_0_rgba(255,252,240,0.8)_inset]"
                      : "border-border/70 bg-secondary/40 hover:border-border",
                  )}
                >
                  <div className="truncate font-display text-[11.5px] font-semibold text-foreground">{k.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{k.protocol}</div>
                </button>
              ))}
            </div>
            {meta && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-glow-accent" />
                <p className="text-[11px] leading-snug text-muted-foreground">{meta.note}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="GPT-4o arena" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Model id</Label>
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder={meta?.modelHint ?? "model-id"}
                className="h-9 font-mono text-[12px]"
              />
            </div>
          </div>

          {kind !== "zai" && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Base URL</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={meta?.defaultBaseUrl || "https://your-endpoint/v1"} className="h-9 font-mono text-[12px]" />
            </div>
          )}

          {meta?.needsKey && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">
                API key {editing && <span className="font-normal text-muted-foreground">(leave blank to keep the stored one)</span>}
              </Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.keyPattern ?? "your key"}
                className="h-9 font-mono text-[12px]"
                autoComplete="off"
              />
            </div>
          )}

          <div>
            <Label className="mb-2 text-[12px]">Agent role — which job does this brain take over?</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-all",
                    role === r.id ? "border-foreground/70 bg-secondary" : "border-border/70 bg-secondary/40 hover:border-border",
                  )}
                >
                  <div className="font-display text-[12px] font-semibold text-foreground">{r.label}</div>
                  <div className="text-[10.5px] text-muted-foreground">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── reliability contract ─────────────────────────────────── */}
          <div className="rule-double pt-3">
            <div className="eyebrow mb-2.5 flex items-center gap-2">
              <Gauge className="h-3 w-3" /> reliability contract
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {numField("Context window", contextWindow, setContextWindow, "auto", {
                step: 1024,
                suffix: "tokens",
                hint: `0 = auto (${meta?.contextHint ? `${(meta.contextHint / 1000).toFixed(0)}k by kind` : "by kind"})`,
              })}
              {numField("Rate limit", rpm, setRpm, "∞", { suffix: "req/min", hint: "0 = unlimited" })}
              {numField("Token limit", tpm, setTpm, "∞", { suffix: "tok/min", hint: "0 = unlimited" })}
              {numField("Concurrency", concurrency, setConcurrency, "∞", { suffix: "parallel", hint: "0 = unlimited" })}
              {numField("Timeout", timeoutSec, setTimeoutSec, "120", { suffix: "seconds", min: 5, max: 3600 })}
              {numField("Max retries", maxRetries, setMaxRetries, "3", { min: 0, max: 10, hint: "per request" })}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {numField("Backoff base", retryBaseMs, setRetryBaseMs, "800", { suffix: "ms", step: 100, hint: "exponential ×2 + jitter" })}
              {numField("Priority", priority, setPriority, "0", { hint: "higher wins the role" })}
              {numField("Cost", costPerMtok, setCostPerMtok, "0.00", { suffix: "$/Mtok", step: 0.1, hint: "blended in+out" })}
            </div>
          </div>

          {/* fallback chain */}
          <div>
            <Label className="mb-1.5 text-[12px]">Fallback — who takes over when this provider dies?</Label>
            <Select value={fallbackId} onValueChange={setFallbackId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="no fallback" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No fallback (fail the call)</SelectItem>
                {fallbackOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-muted-foreground">
              On quota exhaustion, breaker trips or repeated failures the chain advances automatically (≤ 4 hops,
              cycle-safe). If nothing answers, the built-in model is the last resort.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">Temperature</Label>
                <span className="font-mono text-[11px] text-glow-accent">{temperature.toFixed(2)}</span>
              </div>
              <Slider value={[temperature]} min={0} max={1.5} step={0.05} onValueChange={([v]) => setTemperature(v)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Max tokens</Label>
              <Input
                type="number"
                value={maxTokens}
                min={64}
                max={200000}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 1024)}
                className="h-9 font-mono text-[12px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim() || !modelId.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {editing ? "Save changes" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
