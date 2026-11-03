// ── WYRM.LAB · Orchestrator (the sustained agentic loop) ─────────────
// One cycle = GENERATE → VALIDATE → SOLVE (baseline + LLM) → CHECK →
// REVIEW → ELO. Every artifact is persisted for the dashboard.
// Review suggestions from previous cycles flow into the next Thinker
// run as coach hints — the loop remembers.

import { db } from "@/lib/db";
import { HANDCRAFTED_LEVELS } from "./levels";
import { createGame } from "./engine";
import { buildObservation, thinkerSystemPrompt } from "./ascii";
import { validateLevel } from "./validator";
import { generateLevel } from "./generator";
import { mechanicFamilies, type LevelDef } from "./types";
import { runThinker, StepRecord } from "./agents/thinker";
import { checkRun } from "./agents/checker";
import { reviewRun } from "./agents/reviewer";
import { designLevel } from "./agents/levelThinker";
import { computeScore, eloUpdate } from "./elo";
import { createCtl, destroyCtl, emit, getCtl } from "./runcontrol";

let cycleRunning = false;
export const isCycleRunning = () => cycleRunning;

// ── bootstrap: models + handcrafted levels + instant demo runs ───────
let bootstrapped = false;
export async function ensureBootstrap(): Promise<void> {
  if (bootstrapped) return;
  const modelCount = await db.model.count();
  if (modelCount === 0) {
    await db.model.createMany({
      data: [
        {
          key: "glm-4.6",
          name: "GLM-4.6 (LLM Thinker)",
          kind: "llm",
          elo: 1200,
        },
        {
          key: "wyrm-bfs",
          name: "WYRM-BFS (Exhaustive Solver)",
          kind: "solver",
          elo: 1200,
        },
      ],
    });
  }

  const levelCount = await db.level.count();
  if (levelCount === 0) {
    for (const lv of HANDCRAFTED_LEVELS) {
      const report = validateLevel(lv);
      const g = createGame(lv);
      await db.level.create({
        data: {
          slug: lv.slug,
          name: lv.name,
          source: "handcrafted",
          grid: lv.grid.join("\n"),
          difficulty: report.difficulty,
          minMoves: report.minMoves,
          turnLimit: lv.turnLimit ?? 120,
          mechanics: mechanicFamilies(lv.grid).join(","),
          width: g.width,
          height: g.height,
          validated: report.solvable,
          validatorJson: JSON.stringify(report),
        },
      });
    }
  }
  bootstrapped = true;
}

async function levelDefFromRow(row: { grid: string; name: string; slug: string; turnLimit?: number }): Promise<LevelDef> {
  return { name: row.name, slug: row.slug, grid: row.grid.split("\n"), turnLimit: row.turnLimit ?? undefined };
}

// ── run recording ────────────────────────────────────────────────────
interface RunBook {
  runId: string;
  levelRow: { id: string; grid: string; name: string; slug: string; minMoves: number };
  modelKey: string;
}

async function recordSteps(runId: string, steps: StepRecord[]): Promise<void> {
  // insert in chunks to keep writes snappy for the live viewer
  const chunk = 12;
  for (let i = 0; i < steps.length; i += chunk) {
    await db.step.createMany({
      data: steps.slice(i, i + chunk).map((s) => ({
        runId,
        turn: s.turn,
        action: s.action,
        valid: s.valid,
        thought: s.thought?.slice(0, 3000),
        rawOutput: s.rawOutput?.slice(0, 6000),
        obsText: s.obsText?.slice(0, 8000),
        stateAscii: s.stateAscii,
        stateJson: s.stateJson,
        events: JSON.stringify(s.events),
        invalidReason: s.reason?.slice(0, 500),
        latencyMs: s.latencyMs,
        sandbox: s.sandboxJson?.slice(0, 2000),
      })),
    });
  }
}

async function finalizeRun(
  book: RunBook,
  result: {
    status: string;
    attempts: number;
    deaths: number;
    movesUsed: number;
    applesEaten: number;
    splitsUsed: number;
    steps: StepRecord[];
    llmError?: string;
    steers?: number;
    pauses?: number;
  },
  extras: { systemPrompt?: string; firstObs?: string; latencyMs?: number } = {},
): Promise<string> {
  const solved = result.status === "won";
  const score = computeScore(result.movesUsed, solved, result.deaths);
  await db.run.update({
    where: { id: book.runId },
    data: {
      status: result.status,
      attempt: result.attempts,
      movesUsed: result.movesUsed,
      applesEaten: result.applesEaten,
      splitsUsed: result.splitsUsed,
      deaths: result.deaths,
      score,
      latencyMs: extras.latencyMs ?? result.steps.reduce((a, s) => a + s.latencyMs, 0),
      steers: result.steers ?? 0,
      pauses: result.pauses ?? 0,
      endedAt: new Date(),
      ...extras,
    },
  });
  await db.model.update({
    where: { key: book.modelKey },
    data: {
      runs: { increment: 1 },
      wins: { increment: solved ? 1 : 0 },
      losses: { increment: solved ? 0 : 1 },
      totalMoves: { increment: result.movesUsed },
      totalDeaths: { increment: result.deaths },
    },
  });
  return result.status;
}

/** Run the BFS baseline solver and record everything (instant). */
export async function runSolverRun(
  levelId: string,
  modelId: string,
  cycleId: string | null,
): Promise<string> {
  const levelRow = await db.level.findUnique({ where: { id: levelId } });
  if (!levelRow) throw new Error("level not found");
  const level = await levelDefFromRow(levelRow);

  const run = await db.run.create({
    data: {
      levelId,
      modelId,
      cycleId,
      status: "running",
      systemPrompt:
        "Baseline agent: exhaustive breadth-first search over the full game graph. No language model — provably optimal play. Included as the reference line for Elo and efficiency comparisons.",
      firstObs: buildObservation(createGame(level)),
    },
  });

  const result = await runThinker(level, "wyrm-bfs", {
    onStep: async (rec) => {
      await db.step.create({
        data: {
          runId: run.id,
          turn: rec.turn,
          attempt: rec.attempt,
          action: rec.action,
          valid: rec.valid,
          thought: rec.thought?.slice(0, 3000),
          obsText: rec.obsText?.slice(0, 8000),
          stateAscii: rec.stateAscii,
          stateJson: rec.stateJson,
          events: JSON.stringify(rec.events),
          latencyMs: rec.latencyMs,
        },
      });
    },
  });

  await finalizeRun(
    { runId: run.id, levelRow, modelKey: "wyrm-bfs" },
    { ...result, status: result.status },
  );

  // checker certifies (steps are now fully awaited — no race)
  const steps = await db.step.findMany({
    where: { runId: run.id },
    orderBy: [{ turn: "asc" }, { id: "asc" }],
  });
  const verdict = checkRun(level, {
    steps: steps.map((s) => ({
      action: s.action,
      valid: s.valid,
      attempt: s.attempt,
      stateJson: s.stateJson,
      events: s.events,
    })),
    claimedStatus: result.status,
  });
  await db.run.update({
    where: { id: run.id },
    data: {
      checkerVerdict: verdict.verdict,
      checkerJson: JSON.stringify(verdict),
    },
  });
  return run.id;
}

/** Create the LLM run row immediately, execute in the background.
 *  Returns the runId so the client can poll for live steps. */
export async function startLlmRun(
  levelId: string,
  cycleId: string | null,
  coachHints?: string[],
): Promise<string> {
  const levelRow = await db.level.findUnique({ where: { id: levelId } });
  if (!levelRow) throw new Error("level not found");
  const level = await levelDefFromRow(levelRow);
  const model = await db.model.findUnique({ where: { key: "glm-4.6" } });
  if (!model) throw new Error("model not found");

  const run = await db.run.create({
    data: {
      levelId,
      modelId: model.id,
      cycleId,
      status: "running",
      systemPrompt: thinkerSystemPrompt(),
      firstObs: buildObservation(createGame(level), { coachHint: coachHints?.[0] }),
    },
  });

  void executeLlmRun(run.id, levelRow, level, coachHints).catch(async (e) => {
    await db.run.update({
      where: { id: run.id },
      data: { status: "aborted", endedAt: new Date() },
    }).catch(() => undefined);
    console.error("[wyrm] LLM run failed:", e);
  });
  return run.id;
}

/** Full LLM run (awaited) — used inside agentic cycles. */
export async function runLlmRun(
  levelId: string,
  cycleId: string | null,
  coachHints?: string[],
): Promise<string> {
  const levelRow = await db.level.findUnique({ where: { id: levelId } });
  if (!levelRow) throw new Error("level not found");
  const level = await levelDefFromRow(levelRow);
  const model = await db.model.findUnique({ where: { key: "glm-4.6" } });
  if (!model) throw new Error("model not found");

  const run = await db.run.create({
    data: {
      levelId,
      modelId: model.id,
      cycleId,
      status: "running",
      systemPrompt: thinkerSystemPrompt(),
      firstObs: buildObservation(createGame(level), { coachHint: coachHints?.[0] }),
    },
  });
  await executeLlmRun(run.id, levelRow, level, coachHints);
  return run.id;
}

async function executeLlmRun(
  runId: string,
  levelRow: { id: string; grid: string; name: string; slug: string; minMoves: number },
  level: LevelDef,
  coachHints?: string[],
): Promise<void> {
  const ctl = createCtl(runId);
  const result = await runThinker(level, "glm-4.6", {
    coachHints,
    ctl,
    onStep: async (rec) => {
      await db.step.create({
        data: {
          runId,
          turn: rec.turn,
          attempt: rec.attempt,
          action: rec.action,
          valid: rec.valid,
          thought: rec.thought?.slice(0, 3000),
          rawOutput: rec.rawOutput?.slice(0, 6000),
          obsText: rec.obsText?.slice(0, 8000),
          stateAscii: rec.stateAscii,
          stateJson: rec.stateJson,
          events: JSON.stringify(rec.events),
          invalidReason: rec.reason?.slice(0, 500),
          latencyMs: rec.latencyMs,
          sandbox: rec.sandboxJson?.slice(0, 2000),
        },
      });
    },
  });

  await finalizeRun(
    { runId, levelRow, modelKey: "glm-4.6" },
    {
      ...result,
      status: result.status,
      steers: result.steered ?? 0,
      pauses: result.pausedCount ?? 0,
    },
  );
  emit(ctl, { type: "run-end", status: result.status });
  destroyCtl(runId);

  // checker (steps fully awaited — deterministic replay)
  const steps = await db.step.findMany({
    where: { runId },
    orderBy: [{ turn: "asc" }, { id: "asc" }],
  });
  const verdict = checkRun(level, {
    steps: steps.map((s) => ({
      action: s.action,
      valid: s.valid,
      attempt: s.attempt,
      stateJson: s.stateJson,
      events: s.events,
    })),
    claimedStatus: result.status,
  });
  await db.run.update({
    where: { id: runId },
    data: { checkerVerdict: verdict.verdict, checkerJson: JSON.stringify(verdict) },
  });

  // reviewer — or an honest error note when the LLM layer itself failed
  const review = result.llmError
    ? {
        ok: false,
        rating: 0,
        summary: `Run aborted: the model API was unavailable (${result.llmError.slice(0, 160)}). Recorded steps remain intact for replay.`,
        strengths: [],
        weaknesses: [],
        suggestions: [],
        latencyMs: 0,
      }
    : await reviewRun(
        level,
        steps.map((s) => ({
          turn: s.turn,
          action: s.action,
          valid: s.valid,
          reason: s.invalidReason ?? undefined,
          thought: s.thought ?? undefined,
          events: safeParse(s.events),
        })),
        {
          status: result.status,
          moves: result.movesUsed,
          deaths: result.deaths,
          minMoves: levelRow.minMoves,
          model: "glm-4.6",
        },
      );
  await db.run.update({
    where: { id: runId },
    data: {
      reviewJson: JSON.stringify({
        ok: review.ok,
        rating: review.rating,
        summary: review.summary,
        strengths: review.strengths,
        weaknesses: review.weaknesses,
        suggestions: review.suggestions,
        latencyMs: review.latencyMs,
      }),
    },
  });
}

function safeParse(s: string): { type: string; [k: string]: unknown }[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Pull coach hints from the most recent reviewed LLM run (loop memory). */
async function latestCoachHints(): Promise<string[] | undefined> {
  const runs = await db.run.findMany({
    where: { model: { key: "glm-4.6" }, reviewJson: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 1,
  });
  if (runs.length === 0) return undefined;
  try {
    const r = JSON.parse(runs[0].reviewJson!);
    const sugg: string[] = r.suggestions ?? [];
    return sugg.length ? sugg.slice(0, 2) : undefined;
  } catch {
    return undefined;
  }
}

// ── the full agentic cycle ───────────────────────────────────────────
export interface CycleOutcome {
  cycleId: string;
  levelSlug?: string;
  bfsRunId?: string;
  llmRunId?: string;
  error?: string;
}

export async function runCycle(opts: { genMode?: "llm" | "procedural" } = {}): Promise<CycleOutcome> {
  if (cycleRunning) throw new Error("a cycle is already running");
  cycleRunning = true;
  const genMode = opts.genMode ?? "llm";

  try {
    await ensureBootstrap();
    const index = (await db.cycle.count()) + 1;
    const cycle = await db.cycle.create({
      data: { index, status: "running", stage: "generate", genMode },
    });

    // 1 ── GENERATE
    const existingLevels = await db.level.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { name: true, grid: true },
    });
    let levelRow;
    let validatorJson = "";

    if (genMode === "llm") {
      const gen = await designLevel({
        avoidNames: existingLevels.map((l) => l.name),
        avoidGrids: existingLevels.map((l) => l.grid),
      });
      const report = JSON.parse(gen.validatorReport);
      levelRow = await db.level.create({
        data: {
          slug: gen.level.slug,
          name: gen.level.name,
          source: "llm",
          grid: gen.level.grid.join("\n"),
          difficulty: report.difficulty,
          minMoves: report.minMoves,
          turnLimit: gen.level.turnLimit ?? 120,
          mechanics: mechanicFamilies(gen.level.grid).join(","),
          width: gen.level.grid[0].length,
          height: gen.level.grid.length,
          validated: true,
          validatorJson: gen.validatorReport,
          genThought: gen.genThought.slice(0, 4000),
          cycleId: cycle.id,
        },
      });
      validatorJson = gen.validatorReport;
      await db.cycle.update({
        where: { id: cycle.id },
        data: {
          stage: "validate",
          genThought: [
            `New Level Thinker (${gen.source.toUpperCase()}) — attempts:`,
            ...gen.attempts.map((a) => `  round ${a.round}: ${a.outcome}`),
            "",
            gen.genThought.slice(0, 1200),
          ].join("\n"),
        },
      });
    } else {
      const seed = Math.floor(Math.random() * 2_000_000_000);
      const gen = generateLevel(seed, { minMoves: [8, 40], difficulty: [3, 9] });
      const g = createGame(gen.level);
      levelRow = await db.level.create({
        data: {
          slug: gen.level.slug,
          name: gen.level.name,
          source: "procedural",
          grid: gen.level.grid.join("\n"),
          difficulty: gen.report.difficulty,
          minMoves: gen.report.minMoves,
          turnLimit: gen.level.turnLimit ?? 120,
          mechanics: mechanicFamilies(gen.level.grid).join(","),
          width: g.width,
          height: g.height,
          validated: true,
          validatorJson: JSON.stringify(gen.report),
          genThought: `[procedural] seed ${seed}, ${gen.attempts} attempts, accepted at difficulty ${gen.report.difficulty}/10`,
          cycleId: cycle.id,
        },
      });
      validatorJson = JSON.stringify(gen.report);
    }

    await db.cycle.update({
      where: { id: cycle.id },
      data: {
        stage: "solve",
        validatorJson,
        levelId: levelRow.id,
        levelSlug: levelRow.slug,
      },
    });

    // 2 ── SOLVE (baseline first: sets the par)
    const bfsRunId = await runSolverRun(levelRow.id, (await db.model.findUnique({ where: { key: "wyrm-bfs" } }))!.id, cycle.id);

    // 3 ── SOLVE (the LLM show) with loop memory
    const hints = await latestCoachHints();
    const llmRunId = await runLlmRun(levelRow.id, cycle.id, hints);

    // 4 ── ELO (pairwise on this level)
    await applyElo(levelRow.id);

    // 5 ── finish the cycle record
    const llmRun = await db.run.findUnique({ where: { id: llmRunId } });
    let reviewSummary = "";
    try {
      const r = JSON.parse(llmRun?.reviewJson ?? "{}");
      reviewSummary = r.summary ? `${r.summary} (rating ${r.rating}/10)` : "";
    } catch {
      /* noop */
    }
    await db.cycle.update({
      where: { id: cycle.id },
      data: {
        status: "done",
        stage: "done",
        reviewSummary,
        endedAt: new Date(),
      },
    });

    return { cycleId: cycle.id, levelSlug: levelRow.slug, bfsRunId, llmRunId };
  } catch (e) {
    return { cycleId: "", error: (e as Error).message };
  } finally {
    cycleRunning = false;
  }
}

/** Sustained loop: N cycles back-to-back. */
export async function runAutoLoop(n: number, genMode: "llm" | "procedural" = "llm"): Promise<CycleOutcome[]> {
  const outcomes: CycleOutcome[] = [];
  for (let i = 0; i < n; i++) {
    const o = await runCycle({ genMode });
    outcomes.push(o);
    if (o.error) break;
  }
  return outcomes;
}

/** Pairwise Elo between every model pair that ran the same level. */
async function applyElo(levelId: string): Promise<void> {
  const runs = await db.run.findMany({
    where: { levelId, status: { in: ["won", "lost", "dead", "exhausted"] } },
    include: { model: true },
  });
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (a.model.key === b.model.key) continue;
      const { newA, newB } = eloUpdate(
        { elo: a.model.elo, score: a.score, solved: a.status === "won" },
        { elo: b.model.elo, score: b.score, solved: b.status === "won" },
      );
      // apply sequentially to reflect accumulated rating
      await db.model.update({ where: { id: a.modelId }, data: { elo: newA } });
      await db.model.update({ where: { id: b.modelId }, data: { elo: newB } });
      a.model.elo = newA;
      b.model.elo = newB;
    }
  }
}
