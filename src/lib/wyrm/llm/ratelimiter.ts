// ── WYRM.LAB · client-side rate limiting, concurrency & breakers ────
// Production LLM gateways (LiteLLM, OpenRouter) survive flaky vendors
// with three primitives; WYRM.LAB runs the same trio inside the app so
// a self-hosted arena gets them for free:
//
//   · Sliding-window limiter  — RPM and TPM ceilings per provider,
//     enforced BEFORE the request leaves the process.
//   · Concurrency semaphore   — caps parallel in-flight calls.
//   · Circuit breaker         — N consecutive failures (or a quota
//     trip) opens the circuit for a cooldown; the fallback chain takes
//     over instantly instead of hammering a dying endpoint.
//
// All state is in-process (single Node server — matches the SQLite
// deployment) and fully introspectable for the admin dashboard.

import { ENGINE_DEFAULTS } from "./types";

// ── abortable sleep ──────────────────────────────────────────────────
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ── sliding-window limiter + concurrency ─────────────────────────────
interface WindowState {
  reqs: number[]; // request timestamps inside the 60s window
  tokens: { ts: number; n: number }[]; // token spend inside the window
  inflight: number; // semaphore occupancy
  waitedMs: number; // cumulative wait (telemetry)
}

const windows = new Map<string, WindowState>();

function win(key: string): WindowState {
  let w = windows.get(key);
  if (!w) {
    w = { reqs: [], tokens: [], inflight: 0, waitedMs: 0 };
    windows.set(key, w);
  }
  return w;
}

export interface AcquireOpts {
  rpm?: number; // 0/undefined = unlimited
  tpm?: number;
  estTokens?: number; // prompt + expected completion
  concurrency?: number;
  signal?: AbortSignal;
  maxWaitMs?: number; // give up waiting after this (default 120s)
}

/**
 * Block until the request may leave within RPM/TPM/concurrency.
 * Returns the time spent waiting (telemetry). Aborts early (returns)
 * when `signal` fires — callers must check `signal.aborted` after.
 */
export async function acquire(key: string, opts: AcquireOpts): Promise<number> {
  const { rpm = 0, tpm = 0, concurrency = 0, estTokens = 0 } = opts;
  if (!rpm && !tpm && !concurrency) {
    win(key).inflight++; // still track occupancy for the dashboard
    return 0;
  }
  const w = win(key);
  const started = Date.now();
  const maxWaitMs = opts.maxWaitMs ?? ENGINE_DEFAULTS.timeoutMs;
  const WINDOW = ENGINE_DEFAULTS.limiterWindowMs;

  for (;;) {
    if (opts.signal?.aborted) return Date.now() - started;
    const now = Date.now();
    if (now - started > maxWaitMs) {
      // waiting would stall the pipeline — let the caller retry/fail over
      return Date.now() - started;
    }

    // prune the window
    while (w.reqs.length && w.reqs[0] <= now - WINDOW) w.reqs.shift();
    while (w.tokens.length && w.tokens[0].ts <= now - WINDOW) w.tokens.shift();
    const tokenSum = w.tokens.reduce((a, t) => a + t.n, 0);

    // RPM ceiling
    if (rpm > 0 && w.reqs.length >= rpm) {
      const wait = Math.max(50, w.reqs[0] + WINDOW - now + 25);
      await sleepAbortable(Math.min(wait, 1000), opts.signal);
      continue;
    }
    // TPM ceiling (wait until enough spent tokens age out)
    if (tpm > 0 && tokenSum + estTokens > tpm) {
      const wait = Math.max(50, w.tokens[0].ts + WINDOW - now + 25);
      await sleepAbortable(Math.min(wait, 1000), opts.signal);
      continue;
    }
    // concurrency semaphore
    if (concurrency > 0 && w.inflight >= concurrency) {
      await sleepAbortable(60, opts.signal);
      continue;
    }

    // admitted
    w.reqs.push(now);
    w.tokens.push({ ts: now, n: estTokens });
    w.inflight++;
    const waited = Date.now() - started;
    w.waitedMs += waited;
    return waited;
  }
}

/** Release the concurrency slot after a request finishes. */
export function release(key: string): void {
  const w = windows.get(key);
  if (w && w.inflight > 0) w.inflight--;
}

/** Live snapshot for the admin dashboard. */
export function limiterStats(): Record<
  string,
  { rpmUsed: number; tpmUsed: number; inflight: number; waitedMs: number }
> {
  const now = Date.now();
  const WINDOW = ENGINE_DEFAULTS.limiterWindowMs;
  const out: Record<string, { rpmUsed: number; tpmUsed: number; inflight: number; waitedMs: number }> = {};
  for (const [key, w] of windows) {
    const rpmUsed = w.reqs.filter((t) => t > now - WINDOW).length;
    const tpmUsed = w.tokens.filter((t) => t.ts > now - WINDOW).reduce((a, t) => a + t.n, 0);
    out[key] = { rpmUsed, tpmUsed, inflight: w.inflight, waitedMs: w.waitedMs };
  }
  return out;
}

// ── circuit breaker ──────────────────────────────────────────────────
export type CircuitState = "closed" | "open" | "half-open";

interface CircuitBox {
  state: CircuitState;
  failures: number; // consecutive failures
  openedAt: number;
  until: number; // cooldown deadline (ms epoch)
  lastClass?: string;
  totalTrips: number;
  lastError?: string;
}

const circuits = new Map<string, CircuitBox>();

function box(key: string): CircuitBox {
  let c = circuits.get(key);
  if (!c) {
    c = { state: "closed", failures: 0, openedAt: 0, until: 0, totalTrips: 0 };
    circuits.set(key, c);
  }
  return c;
}

/** May we hit this provider right now? (open circuits allow one probe after cooldown) */
export function circuitAllows(key: string): boolean {
  const c = circuits.get(key);
  if (!c || c.state === "closed") return true;
  if (c.state === "open") {
    if (Date.now() >= c.until) {
      c.state = "half-open"; // let a single probe through
      return true;
    }
    return false;
  }
  return true; // half-open: probing
}

export interface CircuitFailureOpts {
  errorClass: string;
  threshold?: number;
  cooldownMs?: number;
  quotaCooldownMs?: number;
  error?: string;
}

/** Record a failure; quota trips open the circuit immediately. */
export function circuitRecordFailure(key: string, opts: CircuitFailureOpts): void {
  const c = box(key);
  c.lastClass = opts.errorClass;
  c.lastError = opts.error?.slice(0, 300);
  if (opts.errorClass === "quota") {
    c.state = "open";
    c.openedAt = Date.now();
    c.until = Date.now() + (opts.quotaCooldownMs ?? ENGINE_DEFAULTS.quotaCooldownMs);
    c.totalTrips++;
    return;
  }
  c.failures++;
  const threshold = opts.threshold ?? ENGINE_DEFAULTS.circuitThreshold;
  if (c.state === "half-open" || c.failures >= threshold) {
    c.state = "open";
    c.openedAt = Date.now();
    c.until = Date.now() + (opts.cooldownMs ?? ENGINE_DEFAULTS.circuitCooldownMs);
    c.totalTrips++;
  }
}

/** Record a success — closes the breaker and resets the failure streak. */
export function circuitRecordSuccess(key: string): void {
  const c = box(key);
  c.state = "closed";
  c.failures = 0;
  c.lastClass = undefined;
  c.lastError = undefined;
}

/** Manual reset from the admin dashboard. */
export function circuitReset(key: string): void {
  const c = circuits.get(key);
  if (c) {
    c.state = "closed";
    c.failures = 0;
    c.until = 0;
    c.lastClass = undefined;
    c.lastError = undefined;
  }
}

export interface CircuitSnapshot {
  state: CircuitState;
  failures: number;
  openedAt: number;
  until: number;
  lastClass?: string;
  lastError?: string;
  totalTrips: number;
  cooldownRemainingMs: number;
}

export function circuitSnapshot(key: string): CircuitSnapshot {
  const c = box(key);
  return {
    state: c.state,
    failures: c.failures,
    openedAt: c.openedAt,
    until: c.until,
    lastClass: c.lastClass,
    lastError: c.lastError,
    totalTrips: c.totalTrips,
    cooldownRemainingMs: Math.max(0, c.until - Date.now()),
  };
}

export function circuitSnapshotAll(): Record<string, CircuitSnapshot> {
  const out: Record<string, CircuitSnapshot> = {};
  for (const key of circuits.keys()) out[key] = circuitSnapshot(key);
  return out;
}
