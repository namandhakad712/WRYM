// ── WRYM · limiter, semaphore & circuit breaker ───────────────────────
// The three primitives that keep the arena inside free-tier ceilings.
// Timing tests use tiny maxWaitMs budgets so the suite stays fast.

import { describe, expect, test } from "bun:test";
import {
  acquire,
  release,
  circuitAllows,
  circuitRecordFailure,
  circuitRecordSuccess,
  circuitReset,
  sleepAbortable,
} from "../src/lib/wyrm/llm/ratelimiter";
import { ENGINE_DEFAULTS } from "../src/lib/wyrm/llm/types";

describe("acquire · sliding window limiter", () => {
  test("no limits configured ⇒ instant admission", async () => {
    const w = await acquire("t-nolimit", {});
    expect(w).toBe(0);
    release("t-nolimit");
  });

  test("RPM=1: second request inside the window must wait", async () => {
    const key = "t-rpm1";
    const first = await acquire(key, { rpm: 1, maxWaitMs: 1 });
    expect(first).toBe(0);
    const t0 = Date.now();
    const second = await acquire(key, { rpm: 1, maxWaitMs: 300 });
    const took = Date.now() - t0;
    expect(second).toBeGreaterThanOrEqual(250); // waited until budget/maxWait
    expect(took).toBeLessThan(2000); // but returned promptly (maxWait honored)
    release(key); release(key);
  });

  test("aborted signal returns instead of blocking", async () => {
    const key = "t-abort";
    await acquire(key, { rpm: 1 });
    const ctl = new AbortController();
    ctl.abort();
    const t0 = Date.now();
    await acquire(key, { rpm: 1, signal: ctl.signal, maxWaitMs: 10_000 });
    expect(Date.now() - t0).toBeLessThan(500);
    release(key);
  });

  test("concurrency=1: a second acquire waits until release", async () => {
    const key = "t-conc1";
    await acquire(key, { concurrency: 1 });
    const p = acquire(key, { concurrency: 1, maxWaitMs: 2000 });
    let admitted = false;
    p.then(() => (admitted = true));
    await sleepAbortable(120);
    expect(admitted).toBe(false); // still blocked while the slot is held
    release(key); // free the slot
    const waited = await p;
    expect(waited).toBeGreaterThanOrEqual(100);
    release(key);
  });
});

describe("circuit breaker", () => {
  test("opens after the configured consecutive failures", () => {
    const key = "t-breaker";
    expect(circuitAllows(key)).toBe(true);
    for (let i = 0; i < ENGINE_DEFAULTS.circuitThreshold; i++) {
      circuitRecordFailure(key, { errorClass: "server", error: "boom" });
    }
    expect(circuitAllows(key)).toBe(false);
    circuitReset(key);
    expect(circuitAllows(key)).toBe(true);
  });

  test("a success resets the consecutive-failure count", () => {
    const key = "t-breaker2";
    for (let i = 0; i < ENGINE_DEFAULTS.circuitThreshold - 1; i++) {
      circuitRecordFailure(key, { errorClass: "server", error: "boom" });
    }
    circuitRecordSuccess(key); // streak broken
    circuitRecordFailure(key, { errorClass: "server", error: "boom" });
    expect(circuitAllows(key)).toBe(true); // never reached the threshold
    circuitReset(key);
  });

  test("quota trips open the circuit for the long cooldown", () => {
    const key = "t-breaker3";
    circuitRecordFailure(key, { errorClass: "quota", error: "billing" });
    expect(circuitAllows(key)).toBe(false);
    circuitReset(key);
  });
});
