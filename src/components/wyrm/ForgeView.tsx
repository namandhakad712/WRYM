"use client";

// ── WYRM.LAB · FORGE — level editor + feature builder ────────────────
// Build levels by hand with the full element vocabulary, live-BFS
// them against the Logic Validator, playtest them yourself with the
// real engine + renderer, then publish them into the arena where
// the Thinker (LLM) and the baseline solver will run them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Hammer,
  Play,
  Pencil,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Undo2,
  SplitSquareHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Eye,
  Save,
  FlaskConical,
  Eraser,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StageCanvas } from "@/components/wyrm/StageCanvas";
import type { GameState, LevelDef } from "@/lib/wyrm/types";
import type { ValidatorReport } from "@/lib/wyrm/types";

// ── element vocabulary (the feature builder) ─────────────────────────
type ToolId =
  | "wall" | "floor" | "dirt" | "plate" | "door" | "exit" | "spike"
  | "valveRight" | "valveLeft" | "valveUp" | "valveDown"
  | "bridge" | "ice" | "lock"
  | "apple" | "crate" | "key"
  | "head" | "body" | "eraser";

interface ToolDef {
  id: ToolId;
  char: string;
  label: string;
  desc: string;
  group: "Terrain" | "Advanced" | "Objects" | "The Worm" | "Tools";
  swatch: string;
}

const TOOLS: ToolDef[] = [
  { id: "wall", char: "#", label: "Bedrock Wall", desc: "Impassable hard rock. Encloses the level. Cross-hatched in ink.", group: "Terrain", swatch: "bg-[#2c2318]" },
  { id: "floor", char: ".", label: "Floor", desc: "Open paper. The worm walks here.", group: "Terrain", swatch: "bg-[#f4eedd]" },
  { id: "dirt", char: "+", label: "Dirt (dig)", desc: "Soft earth. The worm digs through it — it crumbles away permanently and reshapes the maze.", group: "Terrain", swatch: "bg-[#e2d3b2]" },
  { id: "plate", char: "%", label: "Pressure Plate", desc: "Weighed down by crates, remains or worm segments.", group: "Terrain", swatch: "bg-[#e8dcc0]" },
  { id: "door", char: "D", label: "Door", desc: "Sealed while ANY plate is unweighted. Bars drawn in ink.", group: "Terrain", swatch: "bg-[#d9cdaf]" },
  { id: "exit", char: "X", label: "Exit Seal", desc: "Exactly one. The wax seal opens after every apple is eaten.", group: "Terrain", swatch: "bg-[#a33327]" },
  { id: "spike", char: "~", label: "Spikes", desc: "Instant death. Ink thorns on a dark baseline.", group: "Terrain", swatch: "bg-[#3a3226]" },
  { id: "valveRight", char: ">", label: "Valve →", desc: "One-way: may only be ENTERED moving right. Forces loop planning.", group: "Advanced", swatch: "bg-[#a33327]" },
  { id: "valveLeft", char: "<", label: "Valve ←", desc: "One-way: may only be ENTERED moving left.", group: "Advanced", swatch: "bg-[#a33327]" },
  { id: "valveUp", char: "^", label: "Valve ↑", desc: "One-way: may only be ENTERED moving up.", group: "Advanced", swatch: "bg-[#a33327]" },
  { id: "valveDown", char: "v", label: "Valve ↓", desc: "One-way: may only be ENTERED moving down.", group: "Advanced", swatch: "bg-[#a33327]" },
  { id: "bridge", char: "=", label: "Crumble Bridge", desc: "Holds while occupied; collapses to rubble (#) the moment the last weight leaves. Crossing is final.", group: "Advanced", swatch: "bg-[#a07a48]" },
  { id: "ice", char: "_", label: "Ice", desc: "Frictionless: entering starts a SLIDE — many cells, ONE turn. Landing cell is what matters.", group: "Advanced", swatch: "bg-[#dfe9ec]" },
  { id: "lock", char: "L", label: "Lock", desc: "Impassable until a key is carried; entering consumes one key and opens it forever.", group: "Advanced", swatch: "bg-[#d9cdaf]" },
  { id: "apple", char: "*", label: "Apple", desc: "Mandatory food. Each apple grows the worm by one segment.", group: "Objects", swatch: "bg-[#b03a2a]" },
  { id: "crate", char: "$", label: "Crate", desc: "Pushable sokoban-style. Weighs down plates. Cannot enter dirt or ice.", group: "Objects", swatch: "bg-[#c9a56a]" },
  { id: "key", char: "k", label: "Key", desc: "Walk over it to pick it up. Each lock eats exactly one.", group: "Objects", swatch: "bg-[#a33327]" },
  { id: "head", char: "@", label: "Worm Head", desc: "Exactly one. Place it — the body stretches to its left.", group: "The Worm", swatch: "bg-[#221c14]" },
  { id: "body", char: "o", label: "Worm Body", desc: "Extends the starting worm. Must form a contiguous line ending at the head.", group: "The Worm", swatch: "bg-[#3a3226]" },
  { id: "eraser", char: ".", label: "Eraser", desc: "Right-click always erases, whatever is selected.", group: "Tools", swatch: "bg-[#f7f2e4]" },
];

const GROUPS = ["Terrain", "Advanced", "Objects", "The Worm"] as const;

// ── starter template ─────────────────────────────────────────────────
const START_W = 10;
const START_H = 8;
function blankGrid(w: number, h: number): string[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? "#" : ".")),
  );
}

export function ForgeView({
  publishedLevelId,
  onPublished,
  onGoPlays,
}: {
  publishedLevelId?: string | null;
  onPublished?: (levelId: string) => void;
  onGoPlays?: () => void;
}) {
  const qc = useQueryClient();
  const [grid, setGrid] = useState<string[][]>(() => {
    const g = blankGrid(START_W, START_H);
    g[3][3] = "@";
    g[3][2] = "o";
    g[3][5] = "*";
    g[4][7] = "X";
    return g;
  });
  const [tool, setTool] = useState<ToolId>("wall");
  const [painting, setPainting] = useState(false);
  const [mode, setMode] = useState<"edit" | "play">("edit");
  const [name, setName] = useState("My Forge Level");
  const [report, setReport] = useState<ValidatorReport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(publishedLevelId ?? null);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  // test-play state
  const [playState, setPlayState] = useState<GameState | null>(null);
  const [playHistory, setPlayHistory] = useState<GameState[]>([]);
  const [showAscii, setShowAscii] = useState(false);

  const gridRows = useMemo(() => grid.map((r) => r.join("")), [grid]);

  // ── validation (debounced live BFS) ───────────────────────────────
  const validateNow = useCallback(async () => {
    setValidating(true);
    try {
      const r = await fetch("/api/levels/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid: gridRef.current.map((r) => r.join("")) }),
      });
      const j = await r.json();
      setParseError(j.parseError ?? null);
      setReport(j.report ?? null);
      return j;
    } catch {
      toast({ title: "validation failed", description: "could not reach the validator" });
    } finally {
      setValidating(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(validateNow, 700);
    return () => clearTimeout(t);
  }, [gridRows, validateNow]);

  // ── painting ──────────────────────────────────────────────────────
  const paint = useCallback(
    (x: number, y: number, erase: boolean) => {
      setGrid((g) => {
        const ng = g.map((r) => [...r]);
        const t = TOOLS.find((tt) => tt.id === tool)!;
        const ch = erase || tool === "eraser" ? "." : t.char;
        // placing the head replaces any previous head (exactly-one rule)
        if (ch === "@") {
          for (let yy = 0; yy < ng.length; yy++) for (let xx = 0; xx < ng[yy].length; xx++) if (ng[yy][xx] === "@") ng[yy][xx] = ".";
        }
        // exactly one exit
        if (ch === "X") {
          for (let yy = 0; yy < ng.length; yy++) for (let xx = 0; xx < ng[yy].length; xx++) if (ng[yy][xx] === "X") ng[yy][xx] = ".";
        }
        ng[y][x] = ch;
        return ng;
      });
    },
    [tool],
  );

  // ── test play (the real engine, client-side) ──────────────────────
  const startPlay = useCallback(async () => {
    const { createGame } = await import("@/lib/wyrm/engine");
    try {
      const g = createGame({ name, slug: "draft", grid: gridRef.current.map((r) => r.join("")) });
      setPlayState(g);
      setPlayHistory([]);
      setMode("play");
    } catch (e) {
      toast({ title: "cannot playtest", description: (e as Error).message });
    }
  }, [name]);

  const doPlayAction = useCallback(
    async (action: string) => {
      if (!playState || playState.status !== "playing") return;
      const { step } = await import("@/lib/wyrm/engine");
      const r = step(playState, action as never);
      if (r.valid) {
        setPlayHistory((h) => [...h, playState]);
        setPlayState(r.state);
      } else if (r.reason) {
        toast({ title: `${action} rejected`, description: r.reason });
      }
    },
    [playState],
  );

  // keyboard controls in play mode
  useEffect(() => {
    if (mode !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", x: "split", " ": "split",
      };
      const act = map[e.key];
      if (act) {
        e.preventDefault();
        void doPlayAction(act);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, doPlayAction]);

  // ── publish ───────────────────────────────────────────────────────
  const publish = useCallback(async () => {
    if (parseError) {
      toast({ title: "fix the level first", description: parseError });
      return;
    }
    if (!report?.solvable) {
      toast({ title: "the Logic Validator says NO", description: "this level has no solution — nothing unplayable enters the arena" });
      return;
    }
    setPublishing(true);
    try {
      const r = await fetch("/api/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, grid: gridRef.current.map((row) => row.join("")) }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "publish rejected", description: j.error });
        return;
      }
      setPublishedId(j.level.id);
      onPublished?.(j.level.id);
      qc.invalidateQueries({ queryKey: ["levels"] });
      toast({ title: "level published", description: `${j.level.name} is now in the arena — BFS-certified at difficulty ${j.level.difficulty}/10.` });
    } finally {
      setPublishing(false);
    }
  }, [name, parseError, report, onPublished, qc]);

  const runAi = useCallback(
    async (modelKey: "glm-4.6" | "wyrm-bfs") => {
      if (!publishedId) return;
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelId: publishedId, modelKey }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "could not start", description: j.error });
        return;
      }
      setAiRunId(j.runId);
      toast({
        title: modelKey === "wyrm-bfs" ? "baseline solver dispatched" : "Thinker dispatched",
        description: "watch it live from the Plays tab (or the button below)",
      });
    },
    [publishedId],
  );

  // ── ascii preview (what the AI sees) ──────────────────────────────
  const asciiPreview = useMemo(() => gridRows.join("\n"), [gridRows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of grid) for (const ch of row) c[ch] = (c[ch] ?? 0) + 1;
    return c;
  }, [grid]);

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Hammer className="h-3.5 w-3.5" />
            feature builder · level forge
          </div>
          <h1 className="display-1 mt-1.5 text-3xl text-foreground sm:text-4xl">
            Build worlds the <span className="text-primary">AI</span> will get lost in
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Paint with the full element vocabulary, live-BFS against the Logic Validator, playtest with the real engine,
            then publish into the arena. The worm you place is the worm the Thinker must pilot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGrid(blankGrid(grid[0]?.length ?? START_W, grid.length ?? START_H))} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button variant="outline" size="sm" onClick={validateNow} disabled={validating} className="gap-1.5">
            <FlaskConical className={cn("h-3.5 w-3.5", validating && "animate-spin")} /> Re-validate
          </Button>
          {mode === "edit" ? (
            <Button size="sm" onClick={startPlay} className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Playtest
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setMode("edit")} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Back to editing
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        {/* ── left: the board ─────────────────────────────────────── */}
        <div className="panel rounded-xl p-4 sm:p-5">
          {mode === "edit" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">canvas · click & drag to paint · right-click erases</span>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{grid[0]?.length ?? 0}×{grid.length ?? 0}</span>
                  <span>·</span>
                  <span className="font-mono">{counts["@"] ?? 0} heads</span>
                  <span>·</span>
                  <span className="font-mono">{counts["X"] ?? 0} exits</span>
                </div>
              </div>
              <div
                className="wyrm-scroll overflow-x-auto"
                onPointerDown={() => setPainting(true)}
                onPointerUp={() => setPainting(false)}
                onPointerLeave={() => setPainting(false)}
              >
                <div
                  className="grid w-max rounded-lg bg-[#ece4cf] p-2"
                  style={{ gridTemplateColumns: `repeat(${grid[0]?.length ?? 0}, 44px)` }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {grid.map((row, y) =>
                    row.map((ch, x) => (
                      <ForgeCell
                        key={`${x}-${y}`}
                        ch={ch}
                        onPaint={(erase) => paint(x, y, erase)}
                        painting={painting}
                      />
                    )),
                  )}
                </div>
              </div>
            </>
          ) : playState ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "live-pill border",
                    playState.status === "playing" && "border-primary/40 bg-primary/10 text-primary",
                    playState.status === "won" && "border-emerald-400/40 bg-emerald-700/10 text-emerald-800",
                    playState.status === "dead" && "border-red-400/40 bg-red-800/10 text-red-800",
                  )}>
                    {playState.status.toUpperCase()}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    turn {playState.turn} · len {playState.worm.length} · apples {playState.apples.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => {
                    if (playHistory.length) {
                      setPlayState(playHistory[playHistory.length - 1]);
                      setPlayHistory((h) => h.slice(0, -1));
                    }
                  }} disabled={playHistory.length === 0} className="gap-1.5">
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </Button>
                  <Button variant="outline" size="sm" onClick={startPlay} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                </div>
              </div>
              <StageCanvas state={playState} transitionMs={200} className="mx-auto max-w-[560px]" showCoords />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" size="icon" onClick={() => doPlayAction("up")} aria-label="up"><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => doPlayAction("left")} aria-label="left"><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => doPlayAction("down")} aria-label="down"><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => doPlayAction("right")} aria-label="right"><ArrowRight className="h-4 w-4" /></Button>
                <Button size="sm" onClick={() => doPlayAction("split")} className="ml-2 gap-1.5">
                  <SplitSquareHorizontal className="h-4 w-4" /> SPLIT
                </Button>
                <span className="ml-2 hidden font-mono text-[10.5px] text-muted-foreground sm:inline">arrows / WASD · X = split</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── right: feature builder + validator + ai view ─────────── */}
        <div className="space-y-4">
          {/* palette */}
          <div className="panel rounded-xl p-4">
            <div className="eyebrow mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> elements
            </div>
            <div className="space-y-3">
              {GROUPS.map((group) => (
                <div key={group}>
                  <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">{group}</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {TOOLS.filter((t) => t.group === group).map((t) => (
                      <button
                        key={t.id}
                        data-active={tool === t.id}
                        onClick={() => setTool(t.id)}
                        className={cn(
                          "forge-palette-item flex items-start gap-2.5 rounded-lg border border-border/70 bg-secondary/40 p-2 text-left",
                          tool === t.id && "bg-primary/10",
                        )}
                      >
                        <span className={cn("mt-0.5 h-6 w-6 shrink-0 rounded-md border border-black/30 shadow-inner", t.swatch)} />
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-1.5">
                            <span className="font-display text-[12.5px] font-semibold text-foreground">{t.label}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{t.char === "." && t.id === "floor" ? "·" : t.char}</span>
                          </span>
                          <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">{t.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                data-active={tool === "eraser"}
                onClick={() => setTool("eraser")}
                className={cn(
                  "forge-palette-item flex items-center gap-2.5 rounded-lg border border-border/70 bg-secondary/40 p-2 text-left",
                  tool === "eraser" && "bg-primary/10",
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/30 bg-[#f7f2e4]">
                  <Eraser className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span>
                  <span className="font-display text-[12.5px] font-semibold text-foreground">Eraser</span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">right-click always erases</span>
                </span>
              </button>
            </div>
          </div>

          {/* validator verdict */}
          <div className="panel rounded-xl p-4">
            <div className="eyebrow mb-3">logic validator</div>
            {parseError ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-800/40 bg-red-800/10 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <div>
                  <div className="font-display text-[13px] font-semibold text-red-800">Does not parse</div>
                  <div className="mt-0.5 font-mono text-[11px] leading-relaxed text-red-900/80">{parseError}</div>
                </div>
              </div>
            ) : report?.solvable ? (
              <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-start gap-2.5 rounded-lg border border-emerald-700/40 bg-emerald-700/10 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <div className="w-full">
                  <div className="font-display text-[13px] font-semibold text-emerald-800">Solvable — certified</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-emerald-900/80">
                    <span>optimal: <b className="text-emerald-900">{report.minMoves}</b> moves</span>
                    <span>difficulty: <b className="text-emerald-900">{report.difficulty}/10</b></span>
                    <span>states: {report.statesExplored.toLocaleString()}</span>
                    <span>split needed: {report.splitsRequired ? "YES" : "no"}</span>
                    <span>apples: {report.apples}</span>
                    <span>crates: {report.crates}</span>
                    <span>plates: {report.plates}</span>
                    <span>dirt: {report.dirt}</span>
                  </div>
                </div>
              </motion.div>
            ) : report ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-800/40 bg-red-800/10 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <div>
                  <div className="font-display text-[13px] font-semibold text-red-800">No solution exists</div>
                  <div className="mt-0.5 font-mono text-[11px] text-red-900/80">
                    BFS explored {report.statesExplored.toLocaleString()} states — {report.reason}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 p-3 font-mono text-[11px] text-muted-foreground">
                <FlaskConical className={cn("h-3.5 w-3.5", validating && "animate-spin")} /> running BFS…
              </div>
            )}
          </div>

          {/* AI view */}
          <div className="panel rounded-xl p-4">
            <button className="eyebrow mb-2 flex w-full items-center justify-between" onClick={() => setShowAscii((v) => !v)}>
              <span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> ai view (ascii)</span>
              <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground">{showAscii ? "hide" : "show"}</span>
            </button>
            {showAscii && (
              <pre className="panel-inset wyrm-scroll max-h-56 overflow-auto rounded-lg p-3 ascii-grid text-[11px] text-foreground/80">
                {asciiPreview}
              </pre>
            )}
            <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
              This exact text is what the Thinker parses. One character per cell — nothing hidden, nothing pixelated.
            </p>
          </div>

          {/* publish */}
          <div className="panel rounded-xl p-4">
            <div className="eyebrow mb-3">publish to arena</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Level name" className="mb-2.5 font-display" maxLength={40} />
            <Button
              className="w-full gap-1.5"
              onClick={publish}
              disabled={publishing || !!parseError || !report?.solvable}
            >
              <Save className="h-3.5 w-3.5" /> {publishing ? "Publishing…" : "Publish level"}
            </Button>
            {publishedId && (
              <div className="mt-3 space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> published — dispatch agents:
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => runAi("wyrm-bfs")}>
                    <FlaskConical className="h-3 w-3" /> Solver
                  </Button>
                  <Button size="sm" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => runAi("glm-4.6")}>
                    <Sparkles className="h-3 w-3" /> Thinker
                  </Button>
                </div>
                {aiRunId && (
                  <Button size="sm" variant="link" className="h-6 w-full text-[11px] text-primary" onClick={onGoPlays}>
                    watch the run live →
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── one editable cell ────────────────────────────────────────────────
function ForgeCell({ ch, onPaint, painting }: { ch: string; onPaint: (erase: boolean) => void; painting: boolean }) {
  return (
    <div
      className="forge-cell flex h-11 w-11 items-center justify-center"
      onPointerDown={(e) => onPaint(e.button === 2)}
      onPointerEnter={() => painting && onPaint(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onPaint(true);
      }}
    >
      <CellGlyph ch={ch} />
    </div>
  );
}

export function CellGlyph({ ch, size = 34 }: { ch: string; size?: number }) {
  const s = { width: size, height: size };
  const paper = "flex items-center justify-center rounded-[3px] bg-[#f4eedd] ring-1 ring-[#ddd3ba]";
  switch (ch) {
    case "#":
      return (
        <div
          style={s}
          className="rounded-[3px] bg-[#2c2318] ring-1 ring-[#221c14]"
          // cross-hatch texture via repeating-linear-gradient
        />
      );
    case "+":
      return (
        <div style={{ ...s, background: "#e2d3b2", backgroundImage: "radial-gradient(#8a6a42 1px, transparent 1.2px)", backgroundSize: "7px 7px" }} className="rounded-[35%] ring-1 ring-[#6b4f2e]" />
      );
    case "%":
      return (
        <div style={s} className={paper}>
          <div className="h-5 w-5 rounded-full border-[2.5px] border-[#2c2318]/70 bg-[#e8dcc0]" />
        </div>
      );
    case "D":
      return (
        <div style={s} className={paper}>
          <div className="flex h-6 w-4 flex-col justify-between">
            <span className="h-1.5 w-full rounded-sm bg-[#2c2318]" />
            <span className="h-1.5 w-full rounded-sm bg-[#2c2318]" />
            <span className="h-1.5 w-full rounded-sm bg-[#2c2318]" />
          </div>
        </div>
      );
    case "X":
      return (
        <div style={s} className={paper}>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#a33327] ring-1 ring-[#7c221a]">
            <span className="text-[10px] font-bold leading-none text-[#f7f2e4]">X</span>
          </div>
        </div>
      );
    case "~":
      return (
        <div style={s} className={paper}>
          <svg width={size - 10} height={size - 10} viewBox="0 0 24 24">
            <polygon points="4,20 8,6 12,20" fill="none" stroke="#2c2318" strokeWidth="1.6" />
            <polygon points="12,20 16,6 20,20" fill="none" stroke="#2c2318" strokeWidth="1.6" />
            <line x1="3" y1="20" x2="21" y2="20" stroke="#2c2318" strokeWidth="1.4" />
          </svg>
        </div>
      );
    case "*":
      return (
        <div style={s} className={paper}>
          <div className="relative h-5 w-5 rounded-full bg-[#b03a2a] ring-1 ring-[#2c2318]">
            <span className="absolute -top-1 left-2 h-1.5 w-[2px] rotate-12 rounded bg-[#2c2318]" />
          </div>
        </div>
      );
    case "$":
      return (
        <div style={s} className={paper}>
          <div className="relative h-[70%] w-[70%] rounded-[2px] bg-[#c9a56a] ring-1 ring-[#2c2318]">
            <div className="absolute inset-[18%] rotate-45 border-b-2 border-r-2 border-[#77572f]/80" />
          </div>
        </div>
      );
    case "@":
      return (
        <div style={s} className={paper}>
          <div className="h-6 w-6 rounded-full bg-[#221c14] ring-1 ring-black">
            <div className="mt-1.5 flex justify-around px-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f7f2e4]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#f7f2e4]" />
            </div>
          </div>
        </div>
      );
    case "o":
      return (
        <div style={s} className={paper}>
          <div className="h-5 w-5 rounded-full bg-[#3a3226] ring-1 ring-[#221c14]" />
        </div>
      );
    case ">":
    case "<":
    case "^":
    case "v": {
      const rot = { ">": 0, "^": -90, "<": 180, v: 90 }[ch] ?? 0;
      return (
        <div style={s} className={paper}>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#a33327]/10 ring-1 ring-[#a33327]/70" style={{ transform: `rotate(${rot}deg)` }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 6 H8" stroke="#a33327" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M6 3 L9.5 6 L6 9 Z" fill="#a33327" />
            </svg>
          </div>
        </div>
      );
    }
    case "=":
      return (
        <div style={s} className="flex items-center justify-center rounded-[3px] bg-[#2c2318]/10 ring-1 ring-[#ddd3ba]">
          <div className="flex h-[70%] w-[80%] items-stretch justify-between">
            <span className="w-[30%] rounded-[1px] bg-[#a07a48] ring-1 ring-[#77572f]" />
            <span className="w-[30%] rounded-[1px] bg-[#a07a48] ring-1 ring-[#77572f]" />
            <span className="w-[30%] rounded-[1px] bg-[#a07a48] ring-1 ring-[#77572f]" />
          </div>
        </div>
      );
    case "_":
      return (
        <div style={s} className="flex items-center justify-center rounded-[3px] bg-[#dfe9ec] ring-1 ring-[#9fb6bd]">
          <svg width={size - 14} height={size - 14} viewBox="0 0 20 20">
            <path d="M3 13 L8 7 L11 11 L16 5" stroke="rgba(120,150,160,0.75)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M4 17 L10 12 L15 16" stroke="rgba(120,150,160,0.5)" strokeWidth="1" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      );
    case "L":
      return (
        <div style={s} className={paper}>
          <div className="relative h-[62%] w-[62%] rounded-[2px] bg-[#d9cdaf] ring-[1.5px] ring-[#2c2318]">
            <span className="absolute left-1/2 top-[26%] h-[22%] w-[22%] -translate-x-1/2 rounded-full bg-[#2c2318]" />
            <span className="absolute left-1/2 top-[48%] h-[30%] w-[12%] -translate-x-1/2 rounded-[1px] bg-[#2c2318]" />
          </div>
        </div>
      );
    case "k":
      return (
        <div style={s} className={paper}>
          <svg width={size - 12} height={size - 12} viewBox="0 0 22 22" style={{ transform: "rotate(-35deg)" }}>
            <circle cx="6" cy="11" r="3.4" fill="none" stroke="#a33327" strokeWidth="2" />
            <path d="M9.5 11 H19" stroke="#a33327" strokeWidth="2" strokeLinecap="round" />
            <path d="M15 11 V15 M18.5 11 V14" stroke="#a33327" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      );
    default:
      return <div style={s} className="rounded-[3px] bg-[#f4eedd] opacity-80 ring-1 ring-[#e6dcc4]" />;
  }
}
