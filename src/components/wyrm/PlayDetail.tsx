"use client";

// ── WYRM.LAB · PlayDetail — the control room ────────────────────────
// One run, every dimension of it:
//  · dual view of the SAME state — the rendered stage (human eye) and
//    the ASCII board (the literal text the AI parses)
//  · the operator console: PAUSE / RESUME / INTERRUPT / STEER — live,
//    mid-run, mid-generation
//  · the thought stream: every token the model emitted, live while it
//    runs, replayable after it ends
//  · the timeline: scrub through every turn
//  · checker verdict + reviewer critique

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  SendHorizontal,
  Eye,
  Brain,
  ScrollText,
  Timer,
  ShieldCheck,
  MessageSquareWarning,
  ChevronRight,
  Loader2,
  Gauge,
  SplitSquareHorizontal,
  Sparkles,
  SkipBack,
  SkipForward,
  ChevronLeft,
  Volume2,
  VolumeX,
  Keyboard,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/wyrm/sound";
import { StageCanvas } from "@/components/wyrm/StageCanvas";
import { AsciiBoard } from "@/components/wyrm/AsciiBoard";
import { hydrateState, parseEvents, STATUS_META } from "@/components/wyrm/types";
import type { RunDetail, StepRow } from "@/components/wyrm/types";
import type { GameState } from "@/lib/wyrm/types";

type LiveEvent =
  | { type: "hello"; status: string; thinking: string; turns: number }
  | { type: "status"; status: string; note?: string }
  | { type: "llm-delta"; text?: string; thinking?: string }
  | { type: "llm-done"; latencyMs: number; provider: string; model: string }
  | { type: "steer-applied" | "steer-queued"; text: string }
  | { type: "paused" | "resumed" }
  | { type: "step"; turn: number; action: string; valid: boolean; reason?: string; thought?: string; stateJson: string; events: unknown[]; latencyMs: number }
  | { type: "run-end"; status: string };

// ── timeline event markers ──────────────────────────────────────────
// Each step gets at most one colored tick: terminal events (win/death)
// are big, intermediate mechanics (eat/split/dig) are small.
function markerFor(step: StepRow): { color: string; big?: boolean } | null {
  let evs: { type: string }[] = [];
  try {
    const v = JSON.parse(step.events);
    if (Array.isArray(v)) evs = v;
  } catch {
    /* no events */
  }
  const has = (t: string) => evs.some((e) => e.type === t);
  if (has("win")) return { color: "#a3e635", big: true };
  if (has("death")) return { color: "#f87171", big: true };
  if (has("ate")) return { color: "#fcd34d" };
  if (has("split")) return { color: "#e879f9" };
  if (has("dig")) return { color: "#fb923c" };
  if (has("push")) return { color: "#d4a72c" };
  return null;
}

export function PlayDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"render" | "ascii">("render");
  const [stepIdx, setStepIdx] = useState<number>(-1); // -1 = follow live
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Game SFX default on for the replay tool; the engine itself enforces
  // the persisted global mute, and the header toggle is the master switch.
  const [soundOn, setSoundOn] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const [steerText, setSteerText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [liveNote, setLiveNote] = useState<{ at: number; text: string }[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [steerLog, setSteerLog] = useState<{ at: number; text: string }[]>([]);
  const thoughtRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["run", runId],
    queryFn: async (): Promise<{ run: RunDetail }> => {
      const r = await fetch(`/api/runs/${runId}`);
      return r.json();
    },
    refetchInterval: (q) => (q.state.data?.run.status === "running" ? 1500 : false),
  });

  const run = data?.run;
  const steps = run?.steps ?? [];
  const isLive = run?.status === "running";

  // ── SSE live stream ───────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/runs/${runId}/live`);
    let thinkingBuf = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      setLiveThinking(thinkingBuf);
    };

    es.onmessage = (msg) => {
      let ev: LiveEvent;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }
      switch (ev.type) {
        case "hello":
          thinkingBuf = ev.thinking ?? "";
          setLiveThinking(thinkingBuf);
          setLiveStatus(ev.status);
          break;
        case "llm-delta":
          if (ev.thinking) thinkingBuf += ev.thinking;
          if (ev.text) thinkingBuf += ev.text;
          if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 80);
          break;
        case "llm-done":
          thinkingBuf = "";
          setLiveThinking("");
          setLiveNote((n) => [...n.slice(-6), { at: Date.now(), text: `${ev.provider} · ${ev.latencyMs}ms` }]);
          break;
        case "step":
          thinkingBuf = "";
          setLiveThinking("");
          setStepIdx(-1);
          qc.invalidateQueries({ queryKey: ["run", runId] });
          break;
        case "status":
          setLiveStatus(ev.status);
          if (ev.note) setLiveNote((n) => [...n.slice(-6), { at: Date.now(), text: ev.note! }]);
          break;
        case "steer-queued":
        case "steer-applied":
          setSteerLog((l) => [...l, { at: Date.now(), text: ev.text }]);
          if (ev.type === "steer-applied") setSteerText("");
          break;
        case "run-end":
          setLiveStatus(null);
          es.close();
          qc.invalidateQueries({ queryKey: ["run", runId] });
          qc.invalidateQueries({ queryKey: ["runs-header"] });
          break;
      }
    };
    es.onerror = () => {
      // run finished or stream dropped — the query poll will settle it
      es.close();
    };
    return () => {
      es.close();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [isLive, runId, qc]);

  // ── board state for the current step ─────────────────────────────
  const board: GameState | null = useMemo(() => {
    if (!run) return null;
    const idx = stepIdx === -1 ? steps.length - 1 : stepIdx;
    if (idx < 0 || !steps[idx]) return null;
    return hydrateState(steps[idx].stateJson);
  }, [run, steps, stepIdx]);

  const ascii = useMemo(() => {
    if (!run) return "";
    const idx = stepIdx === -1 ? steps.length - 1 : stepIdx;
    if (idx < 0 || !steps[idx]) return run.firstObs?.split("\n").slice(1, 40).join("\n") ?? "";
    return steps[idx].stateAscii;
  }, [run, steps, stepIdx]);

  // auto-play the timeline (speed-aware)
  useEffect(() => {
    if (!autoPlay || steps.length === 0) return;
    const t = setInterval(() => {
      setStepIdx((i) => {
        const next = (i === -1 ? steps.length - 1 : i) + 1;
        if (next >= steps.length) {
          setAutoPlay(false);
          return i;
        }
        return next;
      });
    }, 900 / speed);
    return () => clearInterval(t);
  }, [autoPlay, steps.length, speed]);

  // ── keyboard transport ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const last = steps.length - 1;
      const cur = stepIdx === -1 ? last : stepIdx;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          setAutoPlay((v) => { sfx.play("click"); return !v; });
          break;
        case "ArrowRight":
          e.preventDefault();
          setAutoPlay(false);
          setStepIdx(Math.min(last, cur + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setAutoPlay(false);
          setStepIdx(Math.max(0, cur - 1));
          break;
        case "Home":
          e.preventDefault();
          setAutoPlay(false);
          setStepIdx(0);
          break;
        case "End":
          e.preventDefault();
          setAutoPlay(false);
          setStepIdx(last);
          break;
        case "v":
        case "V":
          setView((v) => (v === "render" ? "ascii" : "render"));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, stepIdx]);

  // keep the thought stream pinned to the bottom while live
  useEffect(() => {
    if (isLive && thoughtRef.current) {
      thoughtRef.current.scrollTop = thoughtRef.current.scrollHeight;
    }
  }, [liveThinking, steps.length, isLive]);

  // ── operator controls ─────────────────────────────────────────────
  const ctl = useCallback(
    async (op: "pause" | "resume" | "interrupt", note?: string) => {
      const r = await fetch(`/api/control/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op }),
      });
      const j = await r.json();
      toast({
        title: op.toUpperCase(),
        description: j.message ?? j.error,
        variant: r.ok ? undefined : "destructive",
      });
      if (op === "pause" || op === "resume") setLiveStatus(op === "pause" ? "paused" : "running");
    },
    [runId],
  );

  const steer = useCallback(async () => {
    const text = steerText.trim();
    if (!text) return;
    const r = await fetch(`/api/control/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "steer", text }),
    });
    const j = await r.json();
    if (!r.ok) {
      toast({ title: "steering failed", description: j.error, variant: "destructive" });
      return;
    }
    toast({ title: "steering note queued", description: "it enters the model's very next prompt, verbatim" });
  }, [runId, steerText]);

  const statusMeta = run ? (STATUS_META[liveStatus === "paused" ? "running" : run.status] ?? STATUS_META.lost) : null;

  if (!run) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> loading run…
      </div>
    );
  }

  const checker = safeParse(run.checkerJson);
  const review = safeParse(run.reviewJson);
  const currentIdx = stepIdx === -1 ? steps.length - 1 : stepIdx;
  const currentStep: StepRow | null = steps[currentIdx] ?? null;
  const followLive = stepIdx === -1;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> All plays
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0">
          <h1 className="display-2 truncate text-xl text-foreground sm:text-2xl">{run.level.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
            <span className="text-foreground/80">{run.model.name}</span>
            <span>·</span>
            <span>difficulty {run.level.difficulty}/10</span>
            <span>·</span>
            <span>par {run.level.minMoves}</span>
            {(run.steers ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="text-primary">{run.steers ?? 0} steers</span>
              </>
            )}
            {(run.pauses ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="text-primary">{run.pauses ?? 0} pauses</span>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {statusMeta && (
            <span className={cn("live-pill border", isLive && liveStatus !== "paused" && "breathe", statusMeta.className)}>
              {liveStatus === "paused" ? "PAUSED" : isLive ? "LIVE" : statusMeta.label}
            </span>
          )}
          {isLive && liveStatus === "paused" && (
            <span className="font-mono text-[10px] text-amber-800">operator hold</span>
          )}
        </div>
      </div>

      {/* ── operator console (live runs only) ─────────────────────── */}
      {isLive && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel glow-ring rounded-xl p-4"
        >
          <div className="eyebrow mb-3 flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5" /> operator console — steer mid-run
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {liveStatus === "paused" ? (
              <Button size="sm" variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-800 hover:bg-emerald-700/10" onClick={() => ctl("resume")}>
                <Play className="h-3.5 w-3.5" /> RESUME
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 border-amber-500/40 text-amber-800 hover:bg-amber-800/10" onClick={() => ctl("pause")}>
                <Pause className="h-3.5 w-3.5" /> PAUSE
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 border-red-500/40 text-red-800 hover:bg-red-800/10" onClick={() => ctl("interrupt")}>
              <Square className="h-3.5 w-3.5" /> INTERRUPT
            </Button>
            <div className="flex min-w-[260px] flex-1 items-center gap-2">
              <div className="relative flex-1">
                <MessageSquareWarning className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary/70" />
                <input
                  value={steerText}
                  onChange={(e) => setSteerText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && steer()}
                  placeholder="Steer the model… e.g. 'push the crate onto the plate first, then split'"
                  className="h-9 w-full rounded-lg border border-border/80 bg-input/60 pl-9 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
                />
              </div>
              <Button size="sm" className="gap-1.5" onClick={steer} disabled={!steerText.trim()}>
                <SendHorizontal className="h-3.5 w-3.5" /> Steer
              </Button>
            </div>
          </div>
          {(steerLog.length > 0 || liveNote.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {steerLog.map((s, i) => (
                <span key={`s${i}`} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">
                  ⎋ {s.text.slice(0, 60)}
                </span>
              ))}
              {liveNote.slice(-3).map((n, i) => (
                <span key={`n${i}`} className="rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                  {n.text}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* ── left: the stage ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="panel overflow-hidden rounded-xl">
            {/* view switch + turn info */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
                <button
                  onClick={() => setView("render")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-[11.5px] font-semibold transition-all",
                    view === "render" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Eye className="h-3.5 w-3.5" /> HUMAN VIEW
                </button>
                <button
                  onClick={() => setView("ascii")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-[11.5px] font-semibold transition-all",
                    view === "ascii" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ScrollText className="h-3.5 w-3.5" /> AI VIEW
                </button>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
                <span>turn <b className="text-foreground">{board?.turn ?? 0}</b></span>
                <span>len <b className="text-foreground">{board?.worm.length ?? 0}</b></span>
                <span>apples <b className="text-foreground">{board?.apples.length ?? 0}</b></span>
              </div>
            </div>

            <div className="border-x border-b border-border/60 bg-[#f7f2e2] p-4">
              {board ? (
                view === "render" ? (
                  <StageCanvas state={board} transitionMs={240} className="mx-auto max-w-[620px]" showCoords sound={soundOn} />
                ) : (
                  <AsciiBoard ascii={ascii} className="mx-auto max-w-[620px]" />
                )
              ) : (
                <div className="flex h-64 items-center justify-center font-mono text-[12px] text-muted-foreground">
                  waiting for the first move…
                </div>
              )}
            </div>

            {/* timeline — pro transport */}
            <div className="border-t border-border/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="first turn"
                    disabled={steps.length === 0}
                    onClick={() => { setAutoPlay(false); sfx.play("click"); setStepIdx(0); }}>
                    <SkipBack className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="previous turn"
                    disabled={steps.length === 0}
                    onClick={() => { setAutoPlay(false); setStepIdx((i) => Math.max(0, (i === -1 ? steps.length - 1 : i) - 1)); }}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="autoplay"
                    disabled={steps.length === 0}
                    onClick={() => { sfx.unlock(); setAutoPlay((v) => !v); }}>
                    {autoPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="next turn"
                    disabled={steps.length === 0}
                    onClick={() => { setAutoPlay(false); setStepIdx((i) => Math.min(steps.length - 1, (i === -1 ? steps.length - 1 : i) + 1)); }}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="last turn"
                    disabled={steps.length === 0}
                    onClick={() => { setAutoPlay(false); setStepIdx(Math.max(0, steps.length - 1)); }}>
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* speed chips */}
                <div className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5" role="group" aria-label="playback speed">
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
                    soundOn
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                  aria-label={soundOn ? "mute" : "unmute"}
                  title={soundOn ? "sound on — click to mute" : "sound off — click to hear the run"}
                >
                  {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowKeys((v) => !v)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                      showKeys ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="keyboard shortcuts"
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                  </button>
                  {showKeys && (
                    <div className="absolute bottom-9 left-1/2 z-20 w-44 -translate-x-1/2 rounded-lg border border-border bg-popover p-2 shadow-xl">
                      {["space — play / pause", "← → — step turn", "home / end — jump", "v — human / AI view"].map((k) => (
                        <div key={k} className="px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{k}</div>
                      ))}
                    </div>
                  )}
                </div>

                <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
                  {steps.length ? `${currentIdx + 1}/${steps.length}` : "0/0"}
                </span>
                {followLive && isLive && (
                  <button
                    className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-widest text-accent"
                    onClick={() => setStepIdx(Math.max(0, steps.length - 1))}
                  >
                    FOLLOWING LIVE
                  </button>
                )}
                {!followLive && (
                  <button
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-widest text-muted-foreground hover:text-foreground"
                    onClick={() => setStepIdx(-1)}
                  >
                    BACK TO LIVE
                  </button>
                )}
              </div>

              {/* event-marked scrubber */}
              <div className="relative mt-2.5">
                <input
                  type="range"
                  className="wyrm-range relative z-10 w-full"
                  min={0}
                  max={Math.max(0, steps.length - 1)}
                  value={currentIdx}
                  onChange={(e) => {
                    setAutoPlay(false);
                    setStepIdx(Number(e.target.value));
                  }}
                  aria-label="timeline"
                />
                {/* event ticks */}
                {steps.length > 1 && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-0">
                    {steps.map((s, i) => {
                      const m = markerFor(s);
                      if (!m) return null;
                      return (
                        <span
                          key={s.id}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            left: `${(i / (steps.length - 1)) * 100}%`,
                            width: m.big ? 7 : 4,
                            height: m.big ? 7 : 4,
                            background: m.color,
                            boxShadow: `0 0 6px ${m.color}`,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              {/* legend */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-muted-foreground/70">
                <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-lime-400" /> win</span>
                <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-400" /> death</span>
                <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-300" /> apple</span>
                <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" /> split</span>
                <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-orange-400" /> dig</span>
                <span className="ml-auto">tip: ← → to step · space to play</span>
              </div>
            </div>
          </div>

          {/* current step card */}
          <AnimatePresence mode="wait">
            {currentStep && (
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="panel rounded-xl p-4"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground">turn {currentStep.turn}</span>
                  <span className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold",
                    currentStep.valid ? "border-emerald-500/40 bg-emerald-700/10 text-emerald-800" : "border-red-500/40 bg-red-800/10 text-red-800",
                  )}>
                    {currentStep.action.toUpperCase()}
                  </span>
                  {currentStep.action === "split" && <SplitSquareHorizontal className="h-3.5 w-3.5 text-primary" />}
                  <span className="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
                    <Timer className="h-3 w-3" /> {currentStep.latencyMs}ms
                  </span>
                  {currentStep.invalidReason && (
                    <span className="rounded bg-red-800/10 px-2 py-0.5 font-mono text-[10.5px] text-red-800">✗ {currentStep.invalidReason}</span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {parseEvents(currentStep.events).map((ev, i) => (
                      <span key={i} className="rounded border border-border/70 bg-secondary/40 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                        {ev.type}
                      </span>
                    ))}
                  </div>
                </div>
                {currentStep.thought && (
                  <div className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary/30 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                    {currentStep.thought}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* checker + reviewer */}
          {!isLive && (checker || review) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {checker && (
                <div className="panel card-lift rounded-xl p-4">
                  <div className="eyebrow mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" /> checker verdict
                  </div>
                  <div className={cn(
                    "display-2 text-lg",
                    checker.verdict === "CERTIFIED" ? "text-emerald-800" : "text-red-800",
                  )}>
                    {checker.verdict === "CERTIFIED" ? "CERTIFIED ✓" : "INVALID ✗"}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Deterministic replay of all {steps.length} recorded steps against the pure engine.
                    {checker.reason ? ` ${checker.reason}` : ""}
                  </p>
                </div>
              )}
              {review && (
                <div className="panel card-lift rounded-xl p-4">
                  <div className="eyebrow mb-2 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" /> reviewer critique
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="display-2 text-lg text-primary">{review.rating ?? "—"}/10</span>
                    <span className="font-mono text-[10px] text-muted-foreground">reviewer rating</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">{review.summary}</p>
                  {review.weaknesses?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {review.weaknesses.slice(0, 3).map((w: string, i: number) => (
                        <li key={i} className="flex gap-1.5 text-[11.5px] text-muted-foreground">
                          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" /> {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right: the mind ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* live thinking */}
          {isLive && (
            <div className="panel glow-ring-accent rounded-xl p-4">
              <div className="eyebrow mb-2 flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 breathe" /> live thinking stream
              </div>
              <div ref={thoughtRef} className="wyrm-scroll max-h-72 overflow-y-auto rounded-lg bg-[#2a2318] p-3">
                {liveThinking ? (
                  <div className="stream-caret whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-accent/90">
                    {liveThinking.slice(-2200)}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin breathe" />
                    {liveStatus === "paused" ? "paused — resume to continue" : "waiting for tokens…"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* thought log */}
          <div className="panel rounded-xl">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="eyebrow flex items-center gap-2">
                <ScrollText className="h-3.5 w-3.5" /> thought log
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{steps.length} steps</span>
            </div>
            <div className="wyrm-scroll max-h-[480px] divide-y divide-border/40 overflow-y-auto">
              {steps.length === 0 && (
                <div className="px-4 py-8 text-center font-mono text-[11px] text-muted-foreground">
                  no recorded steps yet
                </div>
              )}
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setAutoPlay(false);
                    setStepIdx(i);
                  }}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition-colors hover:bg-secondary/30",
                    i === currentIdx && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">#{s.turn}</span>
                    <span className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                      s.valid ? "bg-emerald-700/10 text-emerald-800" : "bg-red-800/10 text-red-800",
                    )}>
                      {s.action}
                    </span>
                    <span className="font-mono text-[9.5px] text-muted-foreground">{s.latencyMs}ms</span>
                  </div>
                  {s.thought && (
                    <div className="mt-1 line-clamp-2 font-mono text-[10.5px] leading-snug text-muted-foreground">
                      {s.thought.replace(/\n/g, " ").slice(0, 140)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* structured instructions */}
          {run.systemPrompt && (
            <div className="panel rounded-xl p-4">
              <details>
                <summary className="eyebrow cursor-pointer list-none">
                  <span className="flex items-center gap-2">
                    <ScrollText className="h-3.5 w-3.5" /> structured instructions (system prompt)
                  </span>
                </summary>
                <pre className="wyrm-scroll mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[#2a2318] p-3 font-mono text-[11px] leading-relaxed text-[#cfc4a8]">
                  {run.systemPrompt}
                </pre>
              </details>
            </div>
          )}

          {/* run stats */}
          <div className="panel rounded-xl p-4">
            <div className="eyebrow mb-3">run stats</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px]">
              <Stat label="moves" value={run.movesUsed} />
              <Stat label="apples" value={`${run.applesEaten}`} />
              <Stat label="splits" value={run.splitsUsed} />
              <Stat label="deaths" value={run.deaths} />
              <Stat label="score" value={run.score} />
              <Stat label="llm time" value={`${(run.latencyMs / 1000).toFixed(1)}s`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="stat-num text-[13px] text-foreground">{value}</span>
    </div>
  );
}

function safeParse(s: string | null): any | null {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
