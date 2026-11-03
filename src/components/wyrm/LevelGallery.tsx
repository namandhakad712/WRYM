"use client";

// ── WYRM.LAB · LevelGallery ─────────────────────────────────────────
// Every level — handcrafted, LLM-designed or procedural — with its
// validator report and one-click "let the AI play it".

import { motion } from "framer-motion";
import { Sparkles, Dices, PenTool, Play, Gauge, Loader2, Trophy } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import type { GameState } from "@/lib/wyrm/types";
import { createGame } from "@/lib/wyrm/engine";
import type { LevelDef } from "@/lib/wyrm/types";
import { StageCanvas } from "./StageCanvas";
import { cn } from "@/lib/utils";
import type { LevelRow } from "./types";

const SOURCE_META: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  handcrafted: { icon: <PenTool className="h-3 w-3" />, label: "handcrafted", cls: "border-border bg-muted/40 text-muted-foreground" },
  llm: { icon: <Sparkles className="h-3 w-3" />, label: "llm-designed", cls: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300" },
  procedural: { icon: <Dices className="h-3 w-3" />, label: "procedural", cls: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300" },
};

export function LevelGallery({ onWatch }: { onWatch: (runId: string) => void }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["levels"],
    queryFn: async () => {
      const r = await fetch("/api/levels");
      return (await r.json()).levels as LevelRow[];
    },
    refetchInterval: 8000,
  });

  const startRun = useMutation({
    mutationFn: async ({ levelId, modelKey }: { levelId: string; modelKey: string }) => {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelId, modelKey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      return j.runId as string;
    },
    onMutate: (v) => setBusyId(v.levelId),
    onSettled: () => setBusyId(null),
    onSuccess: (runId) => {
      toast.success("Run started — opening the watch view");
      qc.invalidateQueries({ queryKey: ["runs"] });
      if (runId) onWatch(runId);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const levels = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Levels</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {levels.length} published · all BFS-certified
        </span>
      </div>
      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading levels…
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {levels.map((lv, i) => {
          const def: LevelDef = { name: lv.name, slug: lv.slug, grid: lv.grid.split("\n") };
          let state: GameState | null = null;
          try {
            state = createGame(def);
          } catch {
            /* skip render */
          }
          const src = SOURCE_META[lv.source] ?? SOURCE_META.handcrafted;
          const solvedBy = lv.solvedBy ?? [];
          return (
            <motion.div
              key={lv.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.5), duration: 0.3 }}
              className="panel flex flex-col gap-3 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-[15px] font-bold leading-tight">{lv.name}</h3>
                  <p className="font-mono text-[10px] text-muted-foreground/70">{lv.slug}</p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]", src.cls)}>
                  {src.icon} {src.label}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/50 bg-[#241d13] p-1.5">
                {state && <StageCanvas state={state} quality="low" maxCellPx={30} className="pointer-events-none" />}
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[10.5px]">
                <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">difficulty</div>
                  <div className="flex items-center gap-1">
                    <Gauge className="h-3 w-3 text-primary/70" />
                    <span className="font-bold">{lv.difficulty}/10</span>
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">optimal</div>
                  <span className="font-bold">{lv.minMoves} moves</span>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">plays</div>
                  <span className="font-bold">{lv.runCount ?? 0}</span>
                </div>
              </div>

              {solvedBy.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Trophy className="h-3 w-3 text-primary/60" />
                  {solvedBy.map((k) => (
                    <span key={k} className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[9.5px] text-primary/90">
                      {k === "glm-4.6" ? "GLM-4.6" : "BFS"}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  disabled={startRun.isPending && busyId === lv.id}
                  onClick={() => startRun.mutate({ levelId: lv.id, modelKey: "glm-4.6" })}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-display text-[12px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
                >
                  {busyId === lv.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  let GLM-4.6 play
                </button>
                <button
                  disabled={startRun.isPending && busyId === lv.id}
                  onClick={() => startRun.mutate({ levelId: lv.id, modelKey: "wyrm-bfs" })}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 font-display text-[12px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" /> optimal
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
