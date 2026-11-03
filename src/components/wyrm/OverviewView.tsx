"use client";

// ── WYRM.LAB · Leaderboard + Overview views ─────────────────────────

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, BrainCircuit, Gauge, Skull, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelRow, GlobalStats } from "./types";
import { PipelineDiagram, WormLogo } from "./brand";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// ── animated counter ─────────────────────────────────────────────────
function CountUp({ to, duration = 1.1 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / (duration * 1000));
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  return <span ref={ref}>{val.toLocaleString()}</span>;
}

export function useModelsData() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async (): Promise<{ models: ModelRow[]; stats: GlobalStats }> => {
      const r = await fetch("/api/models");
      return r.json();
    },
    refetchInterval: 6000,
  });
}

// ── leaderboard ──────────────────────────────────────────────────────
export function Leaderboard() {
  const { data } = useModelsData();
  const models = data?.models ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Leaderboard</h2>
        <span className="font-mono text-[11px] text-muted-foreground">pairwise Elo · K=32</span>
      </div>
      <div className="grid gap-3">
        {models.map((m, i) => {
          const winRate = m.runs > 0 ? Math.round((m.wins / m.runs) * 100) : 0;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className={cn(
                "panel flex flex-wrap items-center gap-4 rounded-2xl p-4",
                i === 0 && "border-primary/40 shadow-[0_0_40px_-12px] shadow-primary/40",
              )}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 font-display text-lg font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {m.kind === "llm" ? (
                    <BrainCircuit className="h-4 w-4 text-primary" />
                  ) : (
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="truncate font-display text-[15px] font-bold">{m.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-muted-foreground">
                  <span>{m.runs} runs</span>
                  <span>{winRate}% wins</span>
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-2.5 w-2.5" /> avg {m.runs > 0 ? Math.round(m.totalMoves / m.runs) : 0} moves
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Skull className="h-2.5 w-2.5" /> {m.totalDeaths} deaths
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-lime-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, winRate)}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold text-glow">{m.elo}</div>
                <div className="font-mono text-[9.5px] uppercase tracking-widest text-muted-foreground">elo</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── overview / command center ────────────────────────────────────────
export function OverviewView({
  onWatchLatest,
  onGoLoop,
  onGoPlays,
}: {
  onWatchLatest: () => void;
  onGoLoop: () => void;
  onGoPlays: () => void;
}) {
  const { data } = useModelsData();
  const qc = useQueryClient();
  const stats = data?.stats;

  const startCycle = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1, genMode: "llm" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      return j;
    },
    onSuccess: () => {
      toast.success("Cycle launched — head to The Loop to watch it work");
      qc.invalidateQueries({ queryKey: ["cycles"] });
      onGoLoop();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="flex flex-col gap-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70">
        <div className="wyrm-mesh absolute inset-0" />
        <div className="wyrm-grid-bg absolute inset-0" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <WormLogo size={44} />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">agentic puzzle laboratory</div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                WYRM<span className="text-primary">.LAB</span>
              </h1>
            </div>
          </div>
          <div className="max-w-2xl">
            <p className="text-[15px] leading-relaxed text-foreground/85">
              A complete agent pipeline playing an original grid-worm puzzle game — levels are{" "}
              <span className="text-fuchsia-300">designed by an LLM</span>, certified by a{" "}
              <span className="text-emerald-800">BFS logic validator</span>, solved by a{" "}
              <span className="text-primary">thinking model</span>, verified by a{" "}
              <span className="text-amber-800">deterministic checker</span> and critiqued by a{" "}
              <span className="text-lime-800">reviewer</span> whose advice feeds the next round. Every thought is recorded.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="font-display"
              disabled={startCycle.isPending}
              onClick={() => startCycle.mutate()}
            >
              <Swords className="mr-1.5 h-4 w-4" />
              {startCycle.isPending ? "launching…" : "run agentic cycle"}
            </Button>
            <Button size="lg" variant="outline" className="font-display" onClick={onWatchLatest}>
              <Trophy className="mr-1.5 h-4 w-4" /> watch the latest play
            </Button>
          </div>
        </div>
      </div>

      {/* stat strip — hero numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "cycles", value: stats?.cycles ?? 0, hint: "full pipeline rounds" },
          { label: "levels", value: stats?.levels ?? 0, hint: "BFS-certified" },
          { label: "plays", value: stats?.runs ?? 0, hint: "recorded runs" },
          { label: "thoughts", value: stats?.steps ?? 0, hint: "model steps logged" },
          {
            label: "llm win rate",
            value: stats && stats.llmRuns > 0 ? Math.round((stats.llmWins / stats.llmRuns) * 100) : 0,
            hint: "GLM-4.6 vs puzzles",
            suffix: "%",
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="panel card-lift group relative overflow-hidden rounded-2xl p-4"
          >
            <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 md:opacity-0" />
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">{s.label}</div>
            <div className="stat-num mt-1 text-[42px] leading-none text-glow sm:text-5xl">
              <CountUp to={s.value} />
              {s.suffix ?? ""}
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground/70">{s.hint}</div>
          </motion.div>
        ))}
      </div>

      {/* pipeline + elo preview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-2xl p-5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" /> the sustained loop
          </div>
          <PipelineDiagram className="mx-auto w-full max-w-sm" />
          <p className="mt-2 text-center font-mono text-[10.5px] text-muted-foreground">
            reviewer suggestions become coach hints for the next thinker run
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="panel rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-primary/70" /> elo
            </div>
            {(data?.models ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-b border-border/40 py-2 last:border-0">
                <span className="font-display text-[13.5px] font-semibold">{m.name}</span>
                <span className="ml-auto font-display text-xl font-bold text-primary">{m.elo}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onGoPlays}
            className="panel group rounded-2xl p-5 text-left transition-colors hover:border-primary/40"
          >
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <BrainCircuit className="h-3.5 w-3.5 text-primary/70" /> every play, every thought
            </div>
            <p className="text-[13px] text-foreground/80">
              Open the plays archive to scrub through any run — the rendered worm, the exact ASCII the model
              parsed, and its reasoning at every single turn.
            </p>
            <span className="mt-2 inline-block font-mono text-[11px] text-primary group-hover:underline">
              browse plays →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
