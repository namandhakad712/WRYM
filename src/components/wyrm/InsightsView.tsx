"use client";

// ── WYRM.LAB · Insights — the analytics of the arena ─────────────────
// Everything here is computed client-side from the run archive:
//   · Elo trajectories replayed pair-by-pair, level by level, exactly
//     like the server rates models (K=32, same-level pairings)
//   · outcome donut, difficulty × win-rate, moves-vs-par scatter and
//     per-model latency — the science view of the laboratory.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Legend,
} from "recharts";
import { ChartSpline, Loader2, Trophy, Gauge, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunRow, ModelRow } from "./types";
import { STATUS_META } from "./types";

// ── palette (hex, matching the Deep Earth system) ────────────────────
const SERIES = ["#E6C36A", "#86E05A", "#D975E8", "#6FB7D9", "#E1834E", "#F2E9D8"];
const OUTCOME_COLORS: Record<string, string> = {
  won: "#86E05A",
  dead: "#E15B4E",
  exhausted: "#E6C36A",
  lost: "#8B8378",
  aborted: "#5C564D",
  invalid: "#D975E8",
  interrupted: "#6FB7D9",
};

const tooltipStyle = {
  contentStyle: {
    background: "rgba(24,19,13,0.96)",
    border: "1px solid rgba(230,195,106,0.25)",
    borderRadius: 10,
    fontFamily: "var(--font-mono-code), monospace",
    fontSize: 11,
    color: "#F2E9D8",
  },
  labelStyle: { color: "#B7AD9C" },
  itemStyle: { color: "#F2E9D8" },
} as const;

export function InsightsView() {
  const { data, isLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: async (): Promise<{ runs: RunRow[]; models: ModelRow[] }> => {
      const [rr, mr] = await Promise.all([fetch("/api/runs"), fetch("/api/models")]);
      const rj = await rr.json();
      const mj = await mr.json();
      return { runs: rj.runs as RunRow[], models: mj.models as ModelRow[] };
    },
    refetchInterval: 20000,
  });

  const runs = useMemo(() => (data?.runs ?? []).slice().sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)), [data]);
  const models = data?.models ?? [];

  // ── 1. replayed Elo trajectories ─────────────────────────────────
  const eloData = useMemo(() => {
    const modelKeys = [...new Set(models.map((m) => m.key))];
    const colorOf = (key: string) => SERIES[modelKeys.indexOf(key) % SERIES.length];
    const rating = new Map<string, number>(modelKeys.map((k) => [k, 1200]));
    // levels in the order their ratings were applied (last run on the level)
    const byLevel = new Map<string, RunRow[]>();
    for (const r of runs) {
      if (!["won", "lost", "dead", "exhausted"].includes(r.status)) continue;
      const arr = byLevel.get(r.levelId) ?? [];
      arr.push(r);
      byLevel.set(r.levelId, arr);
    }
    const levels = [...byLevel.values()].sort((a, b) => {
      const la = Math.max(...a.map((r) => +new Date(r.startedAt)));
      const lb = Math.max(...b.map((r) => +new Date(r.startedAt)));
      return la - lb;
    });
    const points: Record<string, number | string>[] = [{ event: "start", ...Object.fromEntries(modelKeys.map((k) => [k, 1200])) }];
    levels.forEach((lvlRuns, li) => {
      for (let i = 0; i < lvlRuns.length; i++) {
        for (let j = i + 1; j < lvlRuns.length; j++) {
          const a = lvlRuns[i];
          const b = lvlRuns[j];
          if (a.model.key === b.model.key) continue;
          const ra = rating.get(a.model.key) ?? 1200;
          const rb = rating.get(b.model.key) ?? 1200;
          const expA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
          const sA =
            a.status === "won" && b.status !== "won"
              ? 1
              : a.status !== "won" && b.status === "won"
                ? 0
                : a.status === "won" && b.status === "won"
                  ? a.score >= b.score
                    ? 1
                    : 0
                  : 0.5;
          rating.set(a.model.key, Math.round(ra + 32 * (sA - expA)));
          rating.set(b.model.key, Math.round(rb + 32 * (1 - sA - (1 - expA))));
        }
      }
      points.push({
        event: `L${li + 1}`,
        ...Object.fromEntries(modelKeys.map((k) => [k, rating.get(k) ?? 1200])),
      });
    });
    return { points, modelKeys, colorOf, current: Object.fromEntries([...rating.entries()]) };
  }, [runs, models]);

  // ── 2. outcome donut ──────────────────────────────────────────────
  const outcomes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([status, value]) => ({
        status,
        value,
        label: (STATUS_META[status] ?? STATUS_META.lost).label,
      }))
      .sort((a, b) => b.value - a.value);
  }, [runs]);

  // ── 3. difficulty × win rate ──────────────────────────────────────
  const diffData = useMemo(() => {
    const byDiff = new Map<number, { wins: number; total: number }>();
    for (const r of runs) {
      if (["running", "aborted", "interrupted"].includes(r.status)) continue;
      const d = r.level.difficulty;
      const cur = byDiff.get(d) ?? { wins: 0, total: 0 };
      cur.total += 1;
      if (r.status === "won") cur.wins += 1;
      byDiff.set(d, cur);
    }
    return [...byDiff.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([diff, { wins, total }]) => ({
        diff: `D${diff}`,
        winRate: Math.round((wins / total) * 100),
        total,
      }));
  }, [runs]);

  // ── 4. moves vs par scatter ───────────────────────────────────────
  const modelKeys = eloData.modelKeys;
  const scatterByModel = useMemo(() => {
    const keyName = new Map(models.map((m) => [m.key, m.name]));
    return modelKeys.map((k, ki) => ({
      name: keyName.get(k) ?? k,
      color: SERIES[ki % SERIES.length],
      points: runs
        .filter((r) => r.model.key === k && r.status === "won" && r.level.minMoves > 0)
        .map((r) => ({ par: r.level.minMoves, moves: r.movesUsed, z: r.level.difficulty })),
    }));
  }, [runs, modelKeys, models]);

  // ── 5. latency per model ─────────────────────────────────────────
  const latencyData = useMemo(() => {
    const keyName = new Map(models.map((m) => [m.key, m.name]));
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of runs) {
      if (!r.latencyMs || r.latencyMs <= 0) continue;
      const cur = acc.get(r.model.key) ?? { sum: 0, n: 0 };
      cur.sum += r.latencyMs;
      cur.n += 1;
      acc.set(r.model.key, cur);
    }
    return [...acc.entries()].map(([k, { sum, n }]) => ({
      name: (keyName.get(k) ?? k).replace(" (LLM Thinker)", "").replace(" (Exhaustive Solver)", ""),
      ms: Math.round(sum / Math.max(1, n)),
    }));
  }, [runs, models]);

  // ── KPIs ──────────────────────────────────────────────────────────
  const finished = runs.filter((r) => !["running", "aborted", "interrupted"].includes(r.status));
  const wins = finished.filter((r) => r.status === "won");
  const llmRuns = finished.filter((r) => r.model.kind === "llm");
  const llmWins = llmRuns.filter((r) => r.status === "won");
  const best = wins.reduce<RunRow | null>((b, r) => (!b || r.movesUsed - r.level.minMoves < b.movesUsed - b.level.minMoves ? r : b), null);
  const hardest = wins.reduce<RunRow | null>((h, r) => (!h || r.level.difficulty > h.level.difficulty ? r : h), null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> crunching the archive…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="display-2 text-2xl">Insights</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            The science view — Elo trajectories replayed from history with the exact server formula
            (pairwise, K=32), outcome distributions, efficiency and latency.
          </p>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">
          {finished.length} finished runs analysed
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Trophy, label: "wins", value: `${wins.length}`, hint: `of ${finished.length} finished` },
          { icon: Target, label: "llm win rate", value: llmRuns.length ? `${Math.round((llmWins.length / llmRuns.length) * 100)}%` : "—", hint: `${llmWins.length}/${llmRuns.length} runs` },
          { icon: Zap, label: "tightest solve", value: best ? `+${best.movesUsed - best.level.minMoves}` : "—", hint: best ? `${best.level.name}` : "no wins yet" },
          { icon: Gauge, label: "hardest solved", value: hardest ? `D${hardest.level.difficulty}` : "—", hint: hardest ? hardest.level.name : "no wins yet" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="panel rounded-2xl p-4"
          >
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
              <s.icon className="h-3 w-3" /> {s.label}
            </div>
            <div className="mt-1 font-display text-3xl font-bold text-glow">{s.value}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{s.hint}</div>
          </motion.div>
        ))}
      </div>

      {/* Elo trajectory */}
      <div className="panel rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="eyebrow flex items-center gap-2">
            <ChartSpline className="h-3.5 w-3.5" /> elo trajectory — replayed pairwise from history
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
            {eloData.modelKeys.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <i className="h-1.5 w-4 rounded-full" style={{ background: eloData.colorOf(k) }} />
                {models.find((m) => m.key === k)?.name ?? k}
                <b className="text-foreground">{eloData.current[k] ?? 1200}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eloData.points} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="rgba(242,233,216,0.06)" />
              <XAxis dataKey="event" tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" />
              <YAxis domain={["dataMin - 40", "dataMax + 40"]} tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" />
              <Tooltip {...tooltipStyle} />
              {eloData.modelKeys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={eloData.colorOf(k)}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0, fill: eloData.colorOf(k) }}
                  activeDot={{ r: 5 }}
                  isAnimationActive
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* donut + difficulty */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-2xl p-5">
          <div className="eyebrow mb-3">outcome distribution</div>
          <div className="flex items-center gap-4">
            <div className="h-52 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomes}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="88%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {outcomes.map((o) => (
                      <Cell key={o.status} fill={OUTCOME_COLORS[o.status] ?? "#8B8378"} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex w-36 shrink-0 flex-col gap-1.5">
              {outcomes.map((o) => (
                <div key={o.status} className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: OUTCOME_COLORS[o.status] }} />
                  <span className="truncate">{o.label}</span>
                  <b className="ml-auto text-foreground">{o.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel rounded-2xl p-5">
          <div className="eyebrow mb-3">win rate by difficulty</div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={diffData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(242,233,216,0.06)" vertical={false} />
                <XAxis dataKey="diff" tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" />
                <YAxis domain={[0, 100]} tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" unit="%" />
                <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(230,195,106,0.06)" }} />
                <Bar dataKey="winRate" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {diffData.map((d, i) => (
                    <Cell key={i} fill={d.winRate >= 50 ? "#86E05A" : d.winRate > 0 ? "#E6C36A" : "#5C564D"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 font-mono text-[9.5px] text-muted-foreground/70">
            buckets with runs: {diffData.map((d) => `${d.diff}×${d.total}`).join(" · ") || "—"}
          </div>
        </div>
      </div>

      {/* scatter + latency */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-2xl p-5">
          <div className="eyebrow mb-3">efficiency — moves used vs par (winning runs)</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -14 }}>
                <CartesianGrid stroke="rgba(242,233,216,0.06)" />
                <XAxis
                  type="number"
                  dataKey="par"
                  name="par"
                  tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }}
                  stroke="rgba(242,233,216,0.15)"
                  label={{ value: "par (optimal)", position: "insideBottomRight", offset: -2, fill: "#8F867A", fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="moves"
                  name="moves"
                  tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }}
                  stroke="rgba(242,233,216,0.15)"
                />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 10 }} />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: Math.max(6, ...scatterByModel.flatMap((s) => s.points.map((p) => p.par)), 10), y: Math.max(6, ...scatterByModel.flatMap((s) => s.points.map((p) => p.par)), 10) },
                  ]}
                  stroke="#86E05A"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
                {scatterByModel.map((s) => (
                  <Scatter key={s.name} name={s.name} data={s.points} fill={s.color} fillOpacity={0.85} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 font-mono text-[9.5px] text-muted-foreground/70">
            the dashed diagonal is perfection — every move above it is a detour
          </div>
        </div>

        <div className="panel rounded-2xl p-5">
          <div className="eyebrow mb-3">mean step latency by model</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 34 }}>
                <CartesianGrid stroke="rgba(242,233,216,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8F867A", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" unit="ms" />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#B7AD9C", fontSize: 10, fontFamily: "monospace" }} stroke="rgba(242,233,216,0.15)" />
                <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(230,195,106,0.06)" }} />
                <Bar dataKey="ms" radius={[0, 6, 6, 0]} maxBarSize={26} fill="#E6C36A" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 font-mono text-[9.5px] text-muted-foreground/70">
            llm thinking time per move vs the solver&rsquo;s microseconds
          </div>
        </div>
      </div>

      {runs.length === 0 && (
        <div className={cn("panel rounded-2xl p-10 text-center text-[13px] text-muted-foreground")}>
          No runs recorded yet — launch an agentic cycle to grow the dataset.
        </div>
      )}
    </div>
  );
}
