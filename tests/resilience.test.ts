// ── WRYM · failure taxonomy ───────────────────────────────────────────
// The reliability engine's core promise: every failure mode is CLASSIFIED
// before any decision is made. These tests pin the taxonomy so a refactor
// can never silently turn a quota trip into a retryable rate limit (the
// classic way benchmarks burn a day of API budget).

import { describe, expect, test } from "bun:test";
import {
  LLMApiError,
  backoffDelay,
  classifyHttp,
  classifyThrown,
  parseRetryAfter,
  ERROR_CLASS_LABELS,
} from "../src/lib/wyrm/llm/resilience";
import { ENGINE_DEFAULTS } from "../src/lib/wyrm/llm/types";

describe("classifyHttp · status taxonomy", () => {
  test("429 plain → rate_limit, retryable, no failover", () => {
    const c = classifyHttp(429, "Too Many Requests");
    expect(c.cls).toBe("rate_limit");
    expect(c.retryable).toBe(true);
    expect(c.failover).toBe(false);
  });

  test("429 with billing language → quota, NOT retryable, failover", () => {
    for (const body of [
      "You exceeded your current quota",
      "insufficient credit",
      "billing hard limit reached",
      "subscription expired",
    ]) {
      const c = classifyHttp(429, body);
      expect(c.cls).toBe("quota");
      expect(c.retryable).toBe(false);
      expect(c.failover).toBe(true);
    }
  });

  test("401/403 → auth, never retried (config problem)", () => {
    for (const s of [401, 403]) {
      const c = classifyHttp(s, "unauthorized");
      expect(c.cls).toBe("auth");
      expect(c.retryable).toBe(false);
      expect(c.failover).toBe(true);
    }
  });

  test("400 with context language → context, retryable once", () => {
    for (const body of [
      "This model's maximum context length is 4096 tokens",
      "context_length_exceeded",
      "prompt is too long: 9001 tokens",
    ]) {
      const c = classifyHttp(400, body);
      expect(c.cls).toBe("context");
      expect(c.retryable).toBe(true);
    }
  });

  test("400 generic → invalid, failover (bad model id etc.)", () => {
    expect(classifyHttp(400, "unknown model").cls).toBe("invalid");
    expect(classifyHttp(404, "model not found").cls).toBe("invalid");
  });

  test("5xx → server, retryable with backoff", () => {
    for (const s of [500, 502, 503, 529]) {
      const c = classifyHttp(s, "oops");
      expect(c.cls).toBe("server");
      expect(c.retryable).toBe(true);
      expect(c.failover).toBe(false);
    }
  });

  test("408 → timeout", () => {
    expect(classifyHttp(408, "").cls).toBe("timeout");
  });

  test("Retry-After is carried through on 429", () => {
    const c = classifyHttp(429, "slow down", 2500);
    expect(c.retryAfterMs).toBe(2500);
  });
});

describe("parseRetryAfter", () => {
  test("seconds form", () => {
    expect(parseRetryAfter("30")).toBe(30000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  test("capped at 4× the rate ceiling (never waits forever)", () => {
    expect(parseRetryAfter("999999")).toBe(ENGINE_DEFAULTS.rateCapMs * 4);
  });

  test("garbage → undefined (caller picks its own backoff)", () => {
    expect(parseRetryAfter("whenever")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });

  test("HTTP-date form resolves to a positive delay", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeDefined();
    expect(ms as number).toBeGreaterThanOrEqual(0);
  });
});

describe("classifyThrown · exception taxonomy", () => {
  test("timeout outranks abort (our own timer fires AbortError)", () => {
    const e = new DOMException("aborted", "AbortError");
    const c = classifyThrown(e, true);
    expect(c.cls).toBe("timeout");
  });

  test("plain AbortError → operator interrupt, stops the chain", () => {
    const c = classifyThrown(new DOMException("aborted", "AbortError"), false);
    expect(c.cls).toBe("aborted");
    expect(c.retryable).toBe(false);
    expect(c.failover).toBe(false);
  });

  test("fetch/network failures → network, retryable", () => {
    const e = new TypeError("fetch failed");
    expect(classifyThrown(e).cls).toBe("network");
    expect(classifyThrown(new Error("ECONNRESET")).cls).toBe("network");
    expect(classifyThrown(new Error("connection refused")).cls).toBe("network");
  });

  test("empty completions → server (transient), not invalid", () => {
    expect(classifyThrown(new LLMApiError("empty stream", 0, "empty stream")).cls).toBe("server");
  });

  test("LLMApiError keeps its wire facts", () => {
    const e = new LLMApiError("429 slow down", 429, "slow down", 1200);
    const c = classifyThrown(e);
    expect(c.cls).toBe("rate_limit");
    expect(c.retryAfterMs).toBe(1200);
  });
});

describe("backoffDelay · exponential with jitter, capped", () => {
  test("grows exponentially (in expectation) with attempt index", () => {
    // average away the jitter over many samples
    const avg = (n: number) => {
      let s = 0;
      for (let i = 0; i < 400; i++) s += backoffDelay(n, 100, "server");
      return s / 400;
    };
    expect(avg(0)).toBeGreaterThan(40);
    expect(avg(1)).toBeGreaterThan(avg(0) * 1.6);
    expect(avg(2)).toBeGreaterThan(avg(1) * 1.6);
  });

  test("never exceeds the class cap", () => {
    for (let i = 0; i < 200; i++) {
      expect(backoffDelay(i, 1000, "server")).toBeLessThanOrEqual(ENGINE_DEFAULTS.retryCapMs);
      expect(backoffDelay(i, 1000, "rate_limit")).toBeLessThanOrEqual(ENGINE_DEFAULTS.rateCapMs);
    }
  });

  test("rate_limit honors server-provided Retry-After as the base", () => {
    let min = Infinity;
    for (let i = 0; i < 200; i++) min = Math.min(min, backoffDelay(0, 100, "rate_limit", 8000));
    expect(min).toBeGreaterThanOrEqual(4000); // jitter halves at most
  });

  test("every class has a human label (dashboard never shows undefined)", () => {
    const classes = ["rate_limit", "quota", "auth", "context", "server", "network", "timeout", "invalid", "aborted", "unknown"] as const;
    for (const c of classes) expect(ERROR_CLASS_LABELS[c].length).toBeGreaterThan(3);
  });
});
