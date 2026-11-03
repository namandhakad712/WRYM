"use client";

// ── WYRM.LAB · ThoughtStream — the model's exact recorded mind ──────
// Every turn: the action chosen, the reasoning behind it, the engine's
// events, rejected attempts and latency. Click to seek the board.

import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Scissors,
  Brain,
  XCircle,
  CheckCircle2,
  Apple,
  DoorOpen,
  Sparkles,
  Skull,
  Flag,
  Weight,
  Timer,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { StepRow } from "./types";
import { parseEvents } from "./types";

const ACTION_ICON: Record<string, React.ReactNode> = {
  up: <ArrowUp className="h-3.5 w-3.5" />,
  down: <ArrowDown className="h-3.5 w-3.5" />,
  left: <ArrowLeft className="h-3.5 w-3.5" />,
  right: <ArrowRight className="h-3.5 w-3.5" />,
  split: <Scissors className="h-3.5 w-3.5" />,
};

function EventPills({ events }: { events: ReturnType<typeof parseEvents> }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {events.map((e, i) => {
        const cfg = eventStyle(e.type);
        return (
          <span
            key={i}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
              cfg.className,
            )}
          >
            {cfg.icon}
            {cfg.label(e)}
          </span>
        );
      })}
    </div>
  );
}

function eventStyle(type: string): {
  className: string;
  icon: React.ReactNode;
  label: (e: any) => string;
} {
  switch (type) {
    case "ate":
      return {
        className: "border-amber-800/40 bg-amber-800/10 text-amber-800",
        icon: <Apple className="h-3 w-3" />,
        label: (e) => `ate apple (${e.at.x},${e.at.y}) · grew to ${e.newLength}`,
      };
    case "push":
      return {
        className: "border-orange-500/30 bg-orange-500/10 text-orange-300",
        icon: <Weight className="h-3 w-3" />,
        label: (e) => `pushed crate (${e.from.x},${e.from.y})→(${e.to.x},${e.to.y})`,
      };
    case "split":
      return {
        className: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
        icon: <Scissors className="h-3 w-3" />,
        label: (e) => `SPLIT · kept ${e.kept} · dropped ${e.dropped} as remains`,
      };
    case "plates":
      return {
        className: "border-lime-500/30 bg-lime-500/10 text-lime-800",
        icon: <DoorOpen className="h-3 w-3" />,
        label: (e) => `plates ${e.satisfied}/${e.total} weighted`,
      };
    case "spike":
      return {
        className: "border-red-500/40 bg-red-800/10 text-red-800",
        icon: <Skull className="h-3 w-3" />,
        label: (e) => `hit spikes at (${e.at.x},${e.at.y})`,
      };
    case "death":
      return {
        className: "border-red-500/40 bg-red-500/15 text-red-800",
        icon: <Skull className="h-3 w-3" />,
        label: () => "DEATH — attempt over",
      };
    case "exit-sealed":
      return {
        className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
        icon: <Flag className="h-3 w-3" />,
        label: (e) => `exit sealed · ${e.applesLeft} apple(s) left`,
      };
    case "win":
      return {
        className: "border-emerald-400/40 bg-emerald-400/15 text-emerald-800",
        icon: <Sparkles className="h-3 w-3" />,
        label: (e) => `WON in ${e.moves} moves`,
      };
    default:
      return {
        className: "border-border bg-muted/40 text-muted-foreground",
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: () => type,
      };
  }
}

export function ThoughtStream({
  steps,
  activeIndex,
  onSeek,
  live,
  className,
}: {
  steps: StepRow[];
  activeIndex: number;
  onSeek: (i: number) => void;
  live: boolean;
  className?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (live && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [steps.length, live]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {steps.map((s, i) => {
        const active = i === activeIndex;
        const events = parseEvents(s.events);
        return (
          <motion.button
            key={s.id ?? i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(i * 0.015, 0.3) }}
            onClick={() => onSeek(i)}
            className={cn(
              "group w-full rounded-xl border p-3 text-left transition-colors",
              active
                ? "border-primary/50 bg-primary/[0.07] shadow-[0_0_24px_-8px] shadow-primary/30"
                : "border-border/60 bg-card/40 hover:border-primary/25 hover:bg-card/70",
              !s.valid && "border-red-500/25",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-bold",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {s.turn}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide",
                  s.valid
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-red-800/40 bg-red-800/10 text-red-700",
                )}
              >
                {ACTION_ICON[s.action] ?? <Brain className="h-3.5 w-3.5" />}
                {s.action}
              </span>
              {s.valid ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-700" />
              )}
              {s.latencyMs > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
                  <Timer className="h-3 w-3" />
                  {s.latencyMs}ms
                </span>
              )}
            </div>

            {s.invalidReason && (
              <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 font-mono text-[11px] text-red-800/90">
                rejected: {s.invalidReason}
              </div>
            )}

            {s.thought && (
              <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">
                <span className="mr-1.5 inline-flex align-[-2px] text-primary/60">
                  <Brain className="h-3.5 w-3.5" />
                </span>
                {s.thought}
              </p>
            )}

            {events.length > 0 && <EventPills events={events} />}
          </motion.button>
        );
      })}
      {live && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-2.5 text-[12px] text-primary/80">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          The model is thinking…
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
