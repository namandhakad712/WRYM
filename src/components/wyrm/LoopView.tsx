"use client";

// ── WYRM.LAB · LoopView — the sustained agentic loop, cycle by cycle ─

import { motion } from "framer-motion";
import { ChevronDown, Dices, Loader2, ShieldCheck, Sparkles, RefreshCcw, BrainCircuit, Gauge, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CycleRow, RunRow } from "./types";

const STAGES = ["generate", "validate", "solve", "check", "review", "done"] as const;

const STAGE_ICON: Record<string, React.ReactNode> = {
  generate: <Sparkles className="h-3.5 w-3.5" />,
  validate: <ShieldCheck className="h-3.5 w-3.5" />,
  solve: <BrainCircuit className="h-3.5 w-3.5" />,
  check: <Gauge className="h-3.5 w-3.5" />,
  review: <RefreshCcw className="h-3.5 w-3.5" />,
  done: <Zap className="h-3.5 w-3.5" />,
};

export function LoopView({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cycles"],
    queryFn: async (): Promise<{ cycles: CycleRow[]; runs: RunRow[]; running: boolean }> => {
      const r = await fetch("/api/cycles");
      return r.json();
    },
    refetchInterval: (q) => (q.state.data?.running ? 2500 : 8000),
  });

  const startCycle = useMutation({
    mutationFn: async (count: number) => {
      const r = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, genMode: "llm" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed to start");
      return j;
    },
    onSuccess: () => {
      toast.success("Agentic cycle launched — generating → validating → solving → checking → reviewing");
      qc.invalidateQueries({ queryKey: ["cycles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cycles = data?.cycles ?? [];
  const runs = data?.runs ?? [];
  const running = data?.running ?? false;

  const runsForCycle = (cid: string) => runs.filter((r) => r.cycleId === cid);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">The Loop</h2>
          <p className="text-[12px] text-muted-foreground">
            generate → validate → solve → check → review → repeat. Review insights feed the next cycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] font-bold text-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> cycle in progress
            </span>
          )}
          <button
            disabled={running || startCycle.isPending}
            onClick={() => startCycle.mutate(1)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-display text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" /> run 1 cycle
          </button>
          <button
            disabled={running || startCycle.isPending}
            onClick={() => startCycle.mutate(3)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 font-display text-[13px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            <Dices className="h-4 w-4" /> sustained ×3
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading cycles…
        </div>
      )}

      {cycles.length === 0 && !isLoading && (
        <div className="panel rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">no cycles yet — press “run 1 cycle” and watch the whole pipeline work.</p>
        </div>
      )}

      {cycles.length > 0 && cycles.length < 3 && (
        <div className="panel rounded-2xl border-dashed p-6 text-center">
          <p className="text-[12.5px] text-muted-foreground">
            The loop compounds: each new cycle inherits the reviewer’s suggestions as coach hints for the Thinker.
            Run “sustained ×3” to watch the pipeline chain-generate, validate, solve and critique back-to-back —
            this timeline fills with every completed round.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {cycles.map((c, i) => {
          const isOpen = expanded === c.id;
          const cycleRuns = runsForCycle(c.id);
          const stageIdx = STAGES.indexOf(c.stage as (typeof STAGES)[number]);
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.4) }}
              className="panel overflow-hidden rounded-2xl"
            >
              <button className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setExpanded(isOpen ? null : c.id)}>
                <span className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 px-2 font-mono text-[13px] font-bold text-primary">
                  #{c.index}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14px] font-semibold">
                      {c.level?.name ?? "cycle in progress"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold",
                        c.status === "done"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-800"
                          : "border-primary/40 bg-primary/10 text-primary",
                      )}
                    >
                      {c.status === "done" ? "DONE" : c.stage}
                    </span>
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {c.level?.source === "llm"
                        ? "llm-designed"
                        : c.level?.source === "procedural"
                          ? "procedural (fallback)"
                          : c.genMode === "llm"
                            ? "llm mode"
                            : "procedural"}
                    </span>
                  </div>
                  {c.reviewSummary && (
                    <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">{c.reviewSummary}</p>
                  )}
                </div>
                {/* stage progress */}
                <div className="hidden items-center gap-1 md:flex">
                  {STAGES.map((s, si) => (
                    <span
                      key={s}
                      title={s}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md border",
                        c.status === "done" || si < stageIdx
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : si === stageIdx && c.status === "running"
                            ? "border-primary/60 bg-primary/20 text-primary pulse-dot"
                            : "border-border bg-muted/30 text-muted-foreground/40",
                      )}
                    >
                      {STAGE_ICON[s]}
                    </span>
                  ))}
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="border-t border-border/60 bg-background/30 p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-fuchsia-300/70" /> new level thinker output
                      </div>
                      <pre className="wyrm-scroll max-h-52 overflow-auto rounded-lg border border-border/50 bg-[#241d13] p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                        {c.genThought || "—"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-800/70" /> logic validator report
                      </div>
                      <ValidatorReport json={c.validatorJson} />
                    </div>
                  </div>

                  {cycleRuns.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <BrainCircuit className="h-3.5 w-3.5 text-primary/70" /> plays from this cycle
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cycleRuns.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => onOpenRun(r.id)}
                            className="rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 font-mono text-[11px] transition hover:border-primary/40"
                          >
                            {r.model.kind === "llm" ? "GLM-4.6" : "BFS"} · {r.status} · {r.movesUsed} moves →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ValidatorReport({ json }: { json: string | null }) {
  const parsed = useMemo(() => {
    if (!json) return null;
    try {
      return JSON.parse(json) as {
        solvable: boolean;
        minMoves: number;
        difficulty: number;
        statesExplored: number;
        plates: number;
        apples: number;
        crates: number;
        splitsRequired: boolean;
        solution?: string[];
      };
    } catch {
      return null;
    }
  }, [json]);

  if (!json) return <p className="text-[12px] text-muted-foreground">pending…</p>;
  if (!parsed) return <p className="font-mono text-[11px] text-muted-foreground">{json.slice(0, 200)}</p>;

  return (
    <div className="rounded-lg border border-border/50 bg-[#241d13] p-3 font-mono text-[11px] leading-relaxed">
      <div className={parsed.solvable ? "text-emerald-800" : "text-red-800"}>
        {parsed.solvable ? "SOLVABLE ✓" : "UNSOLVABLE ✗"} · optimal {parsed.minMoves} moves
      </div>
      <div className="mt-1 text-muted-foreground">
        difficulty {parsed.difficulty}/10 · {parsed.statesExplored.toLocaleString()} states explored
      </div>
      <div className="mt-1 text-muted-foreground">
        plates {parsed.plates} · apples {parsed.apples} · crates {parsed.crates} · split{" "}
        {parsed.splitsRequired ? "REQUIRED" : "not needed"}
      </div>
      {Array.isArray(parsed.solution) && (
        <div className="mt-1.5 text-primary/80">[{parsed.solution.join(" ")}]</div>
      )}
    </div>
  );
}
