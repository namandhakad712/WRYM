// ── WYRM.LAB · client-side API types ─────────────────────────────────
import type { GameEvent, GameState } from "@/lib/wyrm/types";

export interface RunRow {
  id: string;
  levelId: string;
  cycleId: string | null;
  attempt: number;
  status: "running" | "won" | "lost" | "dead" | "exhausted" | "invalid" | "aborted" | "interrupted";
  movesUsed: number;
  applesEaten: number;
  splitsUsed: number;
  deaths: number;
  score: number;
  latencyMs: number;
  steers?: number;
  pauses?: number;
  systemPrompt: string | null;
  firstObs: string | null;
  checkerVerdict: string | null;
  checkerJson: string | null;
  reviewJson: string | null;
  startedAt: string;
  endedAt: string | null;
  level: LevelRow;
  model: { name: string; key: string; kind: string };
}

export interface StepRow {
  id: string;
  runId: string;
  turn: number;
  attempt: number;
  action: string;
  valid: boolean;
  thought: string | null;
  rawOutput: string | null;
  obsText: string | null;
  stateAscii: string;
  stateJson: string;
  events: string;
  invalidReason: string | null;
  latencyMs: number;
  sandbox?: string | null; // isolation audit JSON
  createdAt: string;
}

export interface RunDetail extends RunRow {
  steps: StepRow[];
  model: { name: string; key: string; kind: string; elo?: number };
}

export interface LevelRow {
  id: string;
  slug: string;
  name: string;
  source: "handcrafted" | "procedural" | "llm" | string;
  grid: string;
  difficulty: number;
  minMoves: number;
  turnLimit?: number;
  mechanics?: string;
  width: number;
  height: number;
  validated: boolean;
  validatorJson: string | null;
  genThought: string | null;
  cycleId: string | null;
  createdAt: string;
  runCount?: number;
  solvedBy?: string[];
}

export interface CycleRow {
  id: string;
  index: number;
  status: string;
  stage: string;
  genMode: string;
  notes: string | null;
  genThought: string | null;
  validatorJson: string | null;
  reviewSummary: string | null;
  levelId: string | null;
  levelSlug: string | null;
  startedAt: string;
  endedAt: string | null;
  level?: { name: string; slug: string; difficulty: number; minMoves: number; source: string } | null;
}

export interface ModelRow {
  id: string;
  key: string;
  name: string;
  kind: string;
  elo: number;
  runs: number;
  wins: number;
  losses: number;
  totalMoves: number;
  totalDeaths: number;
}

export interface GlobalStats {
  cycles: number;
  levels: number;
  runs: number;
  steps: number;
  llmRuns: number;
  llmWins: number;
}

export function parseEvents(s: string): GameEvent[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseState(s: string): GameState | null {
  try {
    return JSON.parse(s) as GameState;
  } catch {
    return null;
  }
}

/** Deserialize the compact stateJson stored on each step. */
export function hydrateState(json: string): GameState | null {
  try {
    const d = JSON.parse(json);
    return {
      width: d.w,
      height: d.h,
      terrain: (d.t as string[]).map((r) => r.split("")) as unknown as GameState["terrain"],
      crates: d.c ?? [],
      apples: d.a ?? [],
      keys: d.k ?? [],
      keysHeld: d.kh ?? 0,
      remains: d.r ?? [],
      pits: d.p ?? [],
      bridgeTouched: d.bt ?? [],
      worm: d.m ?? [],
      turn: d.n ?? 0,
      turnLimit: d.tl ?? 120,
      status: d.s ?? "playing",
      lastEvents: [],
    };
  } catch {
    return null;
  }
}

export const STATUS_META: Record<string, { label: string; className: string }> = {
  running: { label: "RUNNING", className: "text-primary bg-primary/10 border-primary/30" },
  won: { label: "WON", className: "text-primary bg-primary/10 border-primary/30" },
  lost: { label: "LOST", className: "text-muted-foreground bg-muted/40 border-border" },
  dead: { label: "DIED", className: "text-red-800 bg-red-800/10 border-red-800/40" },
  exhausted: { label: "EXHAUSTED", className: "text-amber-800 bg-amber-800/10 border-amber-800/40" },
  invalid: { label: "INVALID", className: "text-red-800 bg-red-800/10 border-red-800/40" },
  aborted: { label: "ABORTED", className: "text-muted-foreground bg-muted/40 border-border" },
  interrupted: { label: "INTERRUPTED", className: "text-amber-800 bg-amber-800/10 border-amber-800/40" },
};
