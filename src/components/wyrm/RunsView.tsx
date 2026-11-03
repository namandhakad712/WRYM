"use client";

// ── WYRM.LAB · RunsView (plays list) ────────────────────────────────

import { motion } from "framer-motion";
import { Play, Trophy, Skull, Timer, Gauge, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { STATUS_META, type RunRow } from "./types";

export function RunsView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: async (): Promise<RunRow[]> => {
      const r = await fetch("/api/runs");
      return (await r.json()).runs;
    },
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "running") ? 2500 : 10000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading plays…
      </div>
    );
  }
  const runs = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Plays</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{runs.length} recorded</span>
      </div>
      {runs.length === 0 && (
        <div className="panel rounded-2xl p-8 text-center text-muted-foreground">
          no plays yet — run a cycle or start one from the levels page
        </div>
      )}
      <div className="grid gap-2.5">
        {runs.map((r, i) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.lost;
          return (
            <motion.button
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.25 }}
              onClick={() => onOpen(r.id)}
              className="group panel flex flex-wrap items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-primary/40"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                  r.model.kind === "llm"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {r.model.kind === "llm" ? <BrainIcon /> : <Gauge className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-[14px] font-semibold">{r.level.name}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold", meta.className)}>
                    {r.status === "running" && <Loader2 className="mr-1 inline h-2.5 w-2.5 animate-spin" />}
                    {meta.label}
                  </span>
                  {r.checkerVerdict === "CERTIFIED" && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-800">
                      certified
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
                  <span>{r.model.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <Play className="h-2.5 w-2.5" /> {r.movesUsed} moves
                  </span>
                  {r.status === "won" && (
                    <span className="inline-flex items-center gap-1 text-primary/80">
                      <Trophy className="h-2.5 w-2.5" /> score {r.score}
                    </span>
                  )}
                  {r.deaths > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-700/80">
                      <Skull className="h-2.5 w-2.5" /> {r.deaths}
                    </span>
                  )}
                  {r.latencyMs > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-2.5 w-2.5" /> {(r.latencyMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span className="text-muted-foreground/60">
                    {new Date(r.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}
