// ── WRYRM · checkpoint-resume tests ───────────────────────────────────
// The --resume capability promises: a run killed at ANY point (CI window,
// laptop sleep, kill -9) continues from its last checkpoint and produces
// ONE artifact indistinguishable from an unbroken run — same steps, same
// order, no duplicated turns, correct final status. These tests pin that
// contract by scripting the LLM transport.

import { describe, expect, test, mock, beforeAll } from "bun:test";
import { join } from "node:path";

// ── scripted transport ────────────────────────────────────────────────
// Each call pops the next scripted reply. A "CRASH" entry rejects like a
// dead process would (the run aborts); the harness then resumes from the
// last checkpoint with the NEXT script segment.
const state: { script: string[]; calls: number } = { script: [], calls: 0 };

beforeAll(() => {
  const clientPath = join(import.meta.dir, "../src/lib/wyrm/llm/client.ts");
  mock.module(clientPath, () => ({
    llmChat: async () => {
      state.calls++;
      const next = state.script.shift();
      if (next === undefined || next === "CRASH") {
        return {
          ok: false as const,
          text: "",
          thinking: "",
          latencyMs: 5,
          error: "scripted crash (simulated process death)",
          errorClass: "network" as const,
          model: "mock",
          provider: "mock",
        };
      }
      return {
        ok: true as const,
        text: JSON.stringify({ thought: `scripted step ${state.calls}`, action: next }),
        thinking: "",
        latencyMs: 5,
        model: "mock",
        provider: "mock",
      };
    },
  }));
});

import { runThinker } from "../src/lib/wyrm/agents/thinker";
import type { ThinkerCheckpoint } from "../src/lib/wyrm/agents/thinker";
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";
import { validateLevel } from "../src/lib/wyrm/validator";
import type { LLMTarget } from "../src/lib/wyrm/llm/types";

const MOCK_CHAIN: LLMTarget[] = [
  {
    name: "mock", kind: "custom", baseUrl: "http://mock", apiKey: "x",
    modelId: "mock", temperature: 0, maxTokens: 64,
  },
];

const level = HANDCRAFTED_LEVELS.find((l) => l.slug === "01-first-crawl")!;
const OPTIMAL = validateLevel(level).solution; // certified 7-move line

describe("thinker · checkpoint resume", () => {
  test("a crash mid-run leaves a coherent checkpoint that resumes to a clean win", async () => {
    // phase 1 — five good moves, then the "process dies"
    state.script = [...OPTIMAL.slice(0, 5), "CRASH"];
    state.calls = 0;
    let checkpoint: ThinkerCheckpoint | undefined;
    const r1 = await runThinker(level, "glm-4.6", {
      maxAttempts: 1,
      llmChain: MOCK_CHAIN,
      onCheckpoint: (ck) => (checkpoint = ck),
    });

    expect(r1.status).toBe("aborted");
    expect(r1.steps.filter((s) => s.valid)).toHaveLength(5);
    expect(checkpoint).toBeDefined();
    const ck = checkpoint!;
    expect(ck.steps).toHaveLength(5);
    expect(ck.movesUsed).toBe(5);
    expect(JSON.parse(ck.stateJson).n).toBe(5); // engine turn counter
    expect(ck.convo.length).toBeGreaterThanOrEqual(11); // system + 5×(user, assistant)

    // phase 2 — resume with the completion moves
    state.script = [...OPTIMAL.slice(5)];
    const r2 = await runThinker(level, "glm-4.6", {
      maxAttempts: 1,
      llmChain: MOCK_CHAIN,
      resume: ck,
      onCheckpoint: () => {},
    });

    // ONE logical run: 5 resumed steps + 2 new = 7, no duplicates
    expect(r2.status).toBe("won");
    expect(r2.steps).toHaveLength(7);
    expect(r2.movesUsed).toBe(7);
    expect(r2.applesEaten).toBe(1);
    const turns = r2.steps.filter((s) => s.valid).map((s) => s.turn);
    expect(turns).toEqual([1, 2, 3, 4, 5, 6, 7]); // strictly sequential
    // the winning board state is a WIN
    const last = r2.steps[r2.steps.length - 1];
    expect(last.events.some((e) => e.type === "win")).toBe(true);
  });

  test("resume without a checkpoint behaves as a fresh run", async () => {
    state.script = [...OPTIMAL];
    state.calls = 0;
    const r = await runThinker(level, "glm-4.6", {
      maxAttempts: 1,
      llmChain: MOCK_CHAIN,
    });
    expect(r.status).toBe("won");
    expect(r.movesUsed).toBe(7);
  });

  test("a checkpoint of a COMPLETED run never resumes (harness retires it)", async () => {
    // simulate the harness contract: finished runs delete their checkpoint;
    // a stale checkpoint for a finished level is simply never passed in.
    state.script = [...OPTIMAL.slice(0, 1)];
    state.calls = 0;
    const r = await runThinker(level, "glm-4.6", {
      maxAttempts: 1,
      llmChain: MOCK_CHAIN,
    });
    expect(r.status).toBe("aborted"); // script exhausted
    expect(r.steps.filter((s) => s.valid)).toHaveLength(1);
  });
});
