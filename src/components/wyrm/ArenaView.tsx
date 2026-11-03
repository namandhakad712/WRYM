"use client";

// ── WYRM.LAB · Arena — synchronized model battles ────────────────────
// The Kaggle-Arena-style view: pick a level that several models have
// played, select 2–3 of their runs, and replay them side by side on a
// shared clock. One playhead, many minds — you literally watch two
// reasoners take different paths through the same puzzle.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Swords,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Crown,
  Skull,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/wyrm/sound";
import { Button } from "@/components/ui/button";
import { StageCanvas } from "@/components/wyrm/StageCanvas";
import { hydrateState, STATUS_META } from "@/components/wyrm/types";
import type { RunRow, RunDetail, StepRow } from "@/components/wyrm/types";
import type { GameState } from "@/lib/wyrm/types";

const MAX_LANES = 3;

// ── pick a lane color per run index ──────────────────────────────────
const LANE = [
  { ring: "ring-primary/60", text: "text-primary", chip: "bg-primary/15 text-primary border-primary/40", bar: "from-amber-500 to-yellow-300" },
  { ring: "ring-emerald-400/60", text: "text-emerald-800", chip: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40", bar: "from-emerald-600 to-lime-400" },
  { ring: "ring-fuchsia-400/60", text: "text-fuchsia-300", chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40", bar: "from-fuchsia-600 to-pink-400" },
];

export function ArenaView() {
  const [levelId, setLevelId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [battling, setBattling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["arena-runs"],
    queryFn: async (): Promise<RunRow[]> => {
      const r = await fetch("/api/runs");
      return (await r.json()).runs;
    },
    refetchInterval: 15000,
  });

  // group runs by level — only levels with 2+ playable runs (steps
  // actually recorded) are arena-worthy
  const levelGroups = useMemo(() => {
    const byLevel = new Map<string, RunRow[]>();
    for (const r of data ?? []) {
      if (r.status === "running" || r.movesUsed <= 0) continue;
      const arr = byLevel.get(r.levelId) ?? [];
      arr.push(r);
      byLevel.set(r.levelId, arr);
    }
    return [...byLevel.entries()]
      .filter(([, runs]) => runs.length >= 2)
      .map(([lid, runs]) => ({
        levelId: lid,
        level: runs[0].level,
        runs: runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
      }));
  }, [data]);

  const group = levelGroups.find((g) => g.levelId === levelId) ?? null;

  const togglePick = (id: string) => {
    sfx.play("click");
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_LANES ? p : [...p, id]));
  };

  if (battling && group && picked.length >= 2) {
    return (
      <BattleView
        key={picked.join("|")}
        group={group}
        runIds={picked}
        onExit={() => {
          setBattling(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="display-2 text-2xl">Arena</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Synchronized battles: pick one level and two or three recorded runs, then watch the models
            race through the <span className="text-foreground">exact same puzzle</span> on a shared clock.
          </p>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">
          {levelGroups.length} contested {levelGroups.length === 1 ? "level" : "levels"}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> scanning the archive…
        </div>
      ) : levelGroups.length === 0 ? (
        <div className="panel rule-double rounded-2xl p-10">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-2 eyebrow-wax">figure · awaiting contenders</div>
            <Swords className="h-7 w-7 text-accent" />
            <h3 className="mt-3 display-2 text-lg">No battle is staged yet</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              The Arena pairs two or three recorded runs of the <span className="text-foreground">same level</span> and
              replays them on a shared clock — one playhead, many minds. Dispatch a second agent onto any level
              (Levels tab → re-run, or launch an agentic cycle) and the bout will be seated here.
            </p>
            <div className="fig-caption mt-5 w-full">
              arena protocol · synchronized replay · lanes are rendered with the same deterministic engine the agents played against
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {levelGroups.map((g, i) => {
            const active = g.levelId === levelId;
            return (
              <motion.button
                key={g.levelId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  sfx.play("click");
                  setLevelId(g.levelId);
                  setPicked([]);
                  setBattling(false);
                }}
                className={cn(
                  "panel card-lift rounded-2xl p-4 text-left",
                  active && "border-primary/50 glow-ring",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-[15px] font-bold">{g.level.name}</span>
                  <span className="shrink-0 rounded-md border border-border/70 bg-secondary/40 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                    diff {g.level.difficulty}/10
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.runs.slice(0, 4).map((r) => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.lost;
                    return (
                      <span key={r.id} className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold", meta.className)}>
                        {meta.label}
                      </span>
                    );
                  })}
                  {g.runs.length > 4 && (
                    <span className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      +{g.runs.length - 4}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 font-mono text-[10px] text-muted-foreground/70">
                  par {g.level.minMoves} · {g.runs.length} runs recorded
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* run picker */}
      <AnimatePresence>
        {group && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="panel rounded-2xl p-5"
          >
            <div className="eyebrow mb-3 flex items-center gap-2">
              <Swords className="h-3.5 w-3.5" /> {group.level.name} — select 2–3 runs to battle
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.runs.map((r) => {
                const on = picked.includes(r.id);
                const meta = STATUS_META[r.status] ?? STATUS_META.lost;
                const lane = picked.indexOf(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => togglePick(r.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3 text-left transition-all hover:border-primary/40",
                      on && cn("bg-secondary/60 ring-2", LANE[lane].ring),
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold",
                        on ? LANE[lane].chip : "border-border/70 text-muted-foreground",
                      )}
                    >
                      {on ? `P${lane + 1}` : "+"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[13px] font-semibold">{r.model.name}</div>
                      <div className="font-mono text-[9.5px] text-muted-foreground">
                        {r.movesUsed} moves · {meta.label}
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold", meta.className)}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                disabled={picked.length < 2}
                onClick={() => {
                  sfx.unlock();
                  sfx.play("steer");
                  setBattling(true);
                }}
                className="gap-1.5 font-display"
              >
                <Swords className="h-4 w-4" /> start synchronized battle
              </Button>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {picked.length < 2 ? `pick ${2 - picked.length} more run${2 - picked.length > 1 ? "s" : ""}` : `${picked.length} lanes locked`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// BattleView — the synchronized replay itself
// ══════════════════════════════════════════════════════════════════════

function BattleView({
  group,
  runIds,
  onExit,
}: {
  group: { levelId: string; level: RunRow["level"]; runs: RunRow[] };
  runIds: string[];
  onExit: () => void;
}) {
  const [details, setDetails] = useState<(RunDetail | null)[] | null>(null);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // battle audio defaults on; the engine enforces the persisted mute
  const [soundOn, setSoundOn] = useState(true);
  const playedEnd = useRef(false);

  // fetch all selected run details (steps included)
  useEffect(() => {
    let alive = true;
    (async () => {
      const rs = await Promise.all(
        runIds.map(async (id) => {
          try {
            const r = await fetch(`/api/runs/${id}`);
            const j = await r.json();
            return (j.run as RunDetail) ?? null;
          } catch {
            return null;
          }
        }),
      );
      if (alive) setDetails(rs);
    })();
    return () => {
      alive = false;
    };
  }, [runIds]);

  const lanes = useMemo(() => {
    const maxLen = details ? Math.max(0, ...details.map((d) => (d ? d.steps.length : 0))) : 0;
    return (details ?? []).map((d, i) => {
      const steps = d?.steps ?? [];
      const idx = Math.min(tick, Math.max(0, steps.length - 1));
      const step: StepRow | null = steps[idx] ?? null;
      const board: GameState | null = step ? hydrateState(step.stateJson) : null;
      const finished = tick >= steps.length - 1 && steps.length > 0;
      return { run: group.runs.find((r) => r.id === runIds[i]) ?? null, detail: d, steps, step, board, finished, laneIdx: i };
    });
  }, [details, tick, group, runIds]);

  const maxLen = lanes.length ? Math.max(...lanes.map((l) => l.steps.length)) : 0;

  // shared clock
  useEffect(() => {
    if (!playing || maxLen === 0) return;
    const t = setInterval(() => {
      setTick((v) => {
        if (v >= maxLen - 1) {
          setPlaying(false);
          return v;
        }
        return v + 1;
      });
    }, 850 / speed);
    return () => clearInterval(t);
  }, [playing, maxLen, speed]);

  // victory sting once the clock runs out
  useEffect(() => {
    if (maxLen > 0 && tick >= maxLen - 1 && !playedEnd.current) {
      playedEnd.current = true;
      if (soundOn) sfx.play("win");
    }
  }, [tick, maxLen, soundOn]);

  if (!details) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> loading battle lanes…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onExit} className="gap-1.5 text-muted-foreground">
          <RotateCcw className="h-4 w-4" /> Arena
        </Button>
        <div className="h-4 w-px bg-border" />
        <div>
          <h2 className="display-2 text-lg sm:text-xl">{group.level.name}</h2>
          <div className="font-mono text-[10px] text-muted-foreground">
            diff {group.level.difficulty}/10 · par {group.level.minMoves} · {lanes.length} lanes
          </div>
        </div>
        <span className="live-pill ml-auto border border-accent/40 bg-accent/10 text-accent">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" /> SYNC BATTLE
        </span>
      </div>

      {/* lanes */}
      <div className={cn("grid gap-4", lanes.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {lanes.map((l) => {
          const meta = l.run ? (STATUS_META[l.run.status] ?? STATUS_META.lost) : STATUS_META.lost;
          const lane = LANE[l.laneIdx];
          return (
            <motion.div
              key={runIds[l.laneIdx]}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: l.laneIdx * 0.08 }}
              className={cn("panel overflow-hidden rounded-2xl", l.finished && "ring-2", l.finished && lane.ring)}
            >
              {/* lane head */}
              <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-2.5">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold", lane.chip)}>
                  P{l.laneIdx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[13.5px] font-bold">{l.run?.model.name ?? "—"}</div>
                  <div className="font-mono text-[9.5px] text-muted-foreground">
                    turn <b className="text-foreground">{l.step?.turn ?? 0}</b> · move{" "}
                    <b className="text-foreground">{(l.step?.action ?? "—").toUpperCase()}</b>
                    {l.step && <span className={l.step.valid ? " text-emerald-700" : " text-red-700"}>{l.step.valid ? " ✓" : " ✗"}</span>}
                  </div>
                </div>
                {l.finished && l.run && (
                  <span className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold", meta.className)}>
                    {l.run.status === "won" ? <Crown className="h-3 w-3" /> : <Skull className="h-3 w-3" />}
                    {meta.label}
                  </span>
                )}
              </div>

              {/* board */}
              <div className="border-x border-b border-border/60 bg-[#f7f2e2] p-3">
                {l.board ? (
                  <StageCanvas
                    state={l.board}
                    transitionMs={200}
                    quality={lanes.length >= 3 ? "low" : "high"}
                    className="w-full"
                    maxCellPx={lanes.length >= 3 ? 34 : 44}
                    sound={l.laneIdx === 0 && soundOn}
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center font-mono text-[11px] text-muted-foreground">
                    {l.steps.length === 0 ? "no steps recorded for this run" : "…"}
                  </div>
                )}
              </div>

              {/* lane footer: action log */}
              <div className="border-t border-border/60 px-4 py-2.5">
                <div className="flex items-center justify-between font-mono text-[9.5px] text-muted-foreground">
                  <span>
                    {l.steps.length} steps · {l.run?.movesUsed ?? 0} moves
                  </span>
                  <span>{l.run?.applesEaten ?? 0} 🍎 · {l.run?.splitsUsed ?? 0} ✂</span>
                </div>
                {l.step?.thought && (
                  <p className="mt-1.5 line-clamp-3 font-mono text-[10px] leading-relaxed text-foreground/60">
                    {l.step.thought.slice(0, 260)}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* shared transport */}
      <div className="panel sticky bottom-3 z-20 rounded-2xl p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="restart"
              onClick={() => { setTick(0); setPlaying(true); sfx.play("click"); }}>
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="previous"
              onClick={() => { setPlaying(false); setTick((t) => Math.max(0, t - 1)); }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="play pause"
              onClick={() => { sfx.unlock(); setPlaying((v) => !v); }}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="next"
              onClick={() => { setPlaying(false); setTick((t) => Math.min(maxLen - 1, t + 1)); }}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="end"
              onClick={() => { setPlaying(false); setTick(Math.max(0, maxLen - 1)); }}>
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5" role="group" aria-label="battle speed">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => { setSpeed(s); sfx.play("click"); }}
                className={cn(
                  "rounded-md px-2 py-1 font-mono text-[10.5px] font-bold transition-all",
                  speed === s ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}×
              </button>
            ))}
          </div>

          <button
            onClick={() => { sfx.unlock(); const on = !soundOn; setSoundOn(on); sfx.setEnabled(on); if (on) sfx.play("eat"); }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
              soundOn ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
            aria-label={soundOn ? "mute" : "unmute"}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
            tick <b className="text-foreground">{Math.min(tick + 1, maxLen)}</b>/{maxLen}
          </span>
        </div>

        <input
          type="range"
          className="wyrm-range mt-2.5 w-full"
          min={0}
          max={Math.max(0, maxLen - 1)}
          value={Math.min(tick, Math.max(0, maxLen - 1))}
          onChange={(e) => {
            setPlaying(false);
            setTick(Number(e.target.value));
          }}
          aria-label="battle timeline"
        />
      </div>
    </div>
  );
}
