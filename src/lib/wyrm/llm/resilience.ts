// ── WYRM.LAB · error taxonomy, retry policy & backoff ───────────────
// Borrowed from how LiteLLM / OpenRouter / production eval harnesses
// treat upstream failures: classify FIRST, then decide. A 429 is not
// an outage, a quota trip is not a rate limit, and a context overflow
// is not a server error — each gets its own retry/failover policy.
//
//   rate_limit → honor Retry-After, exponential backoff, retry same
//   quota      → circuit opens 10 min, fail over IMMEDIATELY
//   auth/invalid → never retried, fail over (it's a config problem)
//   context    → re-fit the prompt smaller, retry once, then fail over
//   server / network / timeout → exponential backoff with full jitter
//   aborted    → operator interrupt, everything stops

import type { ErrorClass } from "./types";
import { ENGINE_DEFAULTS } from "./types";

export interface ClassifiedError {
  cls: ErrorClass;
  retryable: boolean; // retry the SAME provider after backoff?
  failover: boolean; // move down the fallback chain?
  retryAfterMs?: number; // honored from the wire when present
  message: string;
}

/** Error thrown by the HTTP transports, carrying the wire facts. */
export class LLMApiError extends Error {
  status: number;
  body: string;
  retryAfterMs?: number;
  constructor(message: string, status: number, body: string, retryAfterMs?: number) {
    super(message);
    this.name = "LLMApiError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

const QUOTA_RE =
  /quota|billing|insufficient|exceeded your current|payment|credit|balance|subscription/i;
const CONTEXT_RE =
  /context length|context window|maximum context|too many tokens|token limit|context_length_exceeded|prompt is too long|input tokens.*exceed|reduce the length/i;

/** Parse a Retry-After header: seconds or HTTP-date. */
export function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, ENGINE_DEFAULTS.rateCapMs * 4);
  const date = Date.parse(v);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), ENGINE_DEFAULTS.rateCapMs * 4));
  return undefined;
}

/** Classify an HTTP status + response body. */
export function classifyHttp(status: number, body: string, retryAfterMs?: number): ClassifiedError {
  const msg = `${status} ${body.slice(0, 180)}`;

  if (status === 429) {
    if (QUOTA_RE.test(body)) {
      return { cls: "quota", retryable: false, failover: true, message: msg };
    }
    return {
      cls: "rate_limit",
      retryable: true,
      failover: false,
      retryAfterMs,
      message: msg,
    };
  }
  if (status === 401 || status === 403) {
    return { cls: "auth", retryable: false, failover: true, message: msg };
  }
  if (status === 408) {
    return { cls: "timeout", retryable: true, failover: false, message: msg };
  }
  if (status === 404) {
    return { cls: "invalid", retryable: false, failover: true, message: msg };
  }
  if (status === 400 || status === 422) {
    if (CONTEXT_RE.test(body)) {
      return { cls: "context", retryable: true, failover: true, message: msg };
    }
    return { cls: "invalid", retryable: false, failover: true, message: msg };
  }
  if (status >= 500) {
    return { cls: "server", retryable: true, failover: false, message: msg };
  }
  if (CONTEXT_RE.test(body)) {
    return { cls: "context", retryable: true, failover: true, message: msg };
  }
  return { cls: "unknown", retryable: true, failover: true, message: msg };
}

/** Classify a thrown exception (network layers, timeouts, aborts). */
export function classifyThrown(e: unknown, timedOut = false): ClassifiedError {
  if (e instanceof LLMApiError) {
    return classifyHttp(e.status, e.body, e.retryAfterMs ?? parseRetryAfterFromError(e));
  }
  const err = e as Error;
  const name = err?.name ?? "";
  const msg = String(err?.message ?? e).slice(0, 180);

  // timeouts outrank aborts: our own timeout controller fires AbortError
  if (timedOut || name === "TimeoutError" || /timeout|timed out|ETIMEDOUT/i.test(msg)) {
    return { cls: "timeout", retryable: true, failover: false, message: msg };
  }
  if (name === "AbortError") {
    return { cls: "aborted", retryable: false, failover: false, message: msg || "aborted" };
  }
  if (
    name === "TypeError" ||
    /fetch failed|network|econnreset|econnrefused|enotfound|eai_again|socket|terminated|closed|unable to connect|connection refused|connection reset|connection (?:error|closed|ended)|other side closed/i.test(msg)
  ) {
    return { cls: "network", retryable: true, failover: false, message: msg };
  }
  if (/empty completion|empty stream|no response body/i.test(msg)) {
    return { cls: "server", retryable: true, failover: false, message: msg };
  }
  return { cls: "unknown", retryable: true, failover: true, message: msg };
}

function parseRetryAfterFromError(_e: LLMApiError): number | undefined {
  return undefined; // headers already extracted at throw site
}

/**
 * Backoff delay for attempt N (0-based) of a retryable class.
 * Full jitter: uniform in [delay/2, delay] — prevents thundering herds
 * when a whole arena of models retries against the same vendor.
 */
export function backoffDelay(
  attempt: number, // 0-based retry index
  baseMs: number,
  cls: ErrorClass,
  retryAfterMs?: number,
): number {
  const cap = cls === "rate_limit" ? ENGINE_DEFAULTS.rateCapMs : ENGINE_DEFAULTS.retryCapMs;
  if (cls === "rate_limit") {
    const base = retryAfterMs ?? Math.max(1000, baseMs * 3);
    const delay = Math.min(cap, base * Math.pow(2, attempt));
    return Math.floor(delay / 2 + Math.random() * (delay / 2));
  }
  const delay = Math.min(cap, baseMs * Math.pow(2, attempt));
  return Math.floor(delay / 2 + Math.random() * (delay / 2));
}

/** Human label for the dashboard. */
export const ERROR_CLASS_LABELS: Record<ErrorClass, string> = {
  rate_limit: "Rate limit (429)",
  quota: "Quota / billing exhausted",
  auth: "Auth failed (401/403)",
  context: "Context window exceeded",
  server: "Upstream server error (5xx)",
  network: "Network failure",
  timeout: "Request timeout",
  invalid: "Invalid request / model",
  aborted: "Operator interrupt",
  unknown: "Unknown",
};
