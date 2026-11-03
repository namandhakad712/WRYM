// ── WYRM.LAB · Agent Sandbox — strict isolation (SERVER ONLY) ────────
// Every agent runs behind this boundary. The isolation model:
//
//  L1 · OBSERVATION FIREWALL
//      Agents receive ONLY the whitelisted text projection of the game
//      state. The projection is a JSON round-trip of primitive fields
//      (any hidden references, functions or ambient context are
//      destroyed) and then deep-frozen. No engine objects, no DB rows,
//      no filesystem, no environment variables ever cross this line.
//
//  L2 · OUTPUT QUARANTINE
//      Raw model output is captured verbatim for the audit trail, then:
//      size-capped, control-character-stripped, and parsed against a
//      strict JSON schema. Nothing executes, nothing is eval'd, no tool
//      or function calling is offered. Malformed output is rejected
//      with a machine-readable violation list — the agent may retry,
//      the environment never bends.
//
//  L3 · RESOURCE LIMITS
//      Per-call wall-clock timeout, hard output caps, bounded retries,
//      and AbortSignal composition: an operator interrupt kills the
//      in-flight stream mid-token.
//
//  L4 · SECRET ISOLATION
//      Provider credentials live server-side only. They never appear
//      in observations, thoughts, logs or API responses (the admin UI
//      receives a masked key). The audit record stores BYTE COUNTS,
//      never contents of secrets.
//
//  L5 · DETERMINISTIC REPLAY
//      Nothing an agent claims is trusted. The Checker re-derives the
//      full outcome from (level, action log) alone; any divergence
//      invalidates the run.

import { GameState } from "./types";
import { buildObservation, ObservationOpts } from "./ascii";
import { deserializeState, serializeState } from "./engine";

// ── policy ───────────────────────────────────────────────────────────
export const SANDBOX_POLICY = {
  maxOutputChars: 8_000, // hard cap on quarantined output
  maxThoughtChars: 4_000, // schema cap for the "thought" field
  callTimeoutMs: 90_000, // per-call wall clock
  maxRetries: 2,
  maxKeysHeldLeak: 0, // (reserved) no future ambient fields
} as const;

// ── L1 · observation firewall ────────────────────────────────────────

/** Deep-freeze a plain object graph (primitives + arrays only). */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) {
      deepFreeze((v as Record<string, unknown>)[k]);
    }
  }
  return v;
}

/** Whitelisted projection of a game state for agent consumption.
 *  JSON round-trip guarantees only the declared primitive fields
 *  survive — no references into engine internals can leak. */
export function whitelistState(s: GameState): GameState {
  const plain = JSON.parse(serializeState(s)) as unknown;
  return deepFreeze(deserializeState(JSON.stringify(plain))) as GameState;
}

/** The ONLY way an agent sees the game. Frozen text, nothing else. */
export function projectObservation(s: GameState, opts: ObservationOpts = {}): string {
  return Object.freeze(
    buildObservation(whitelistState(s), {
      history: opts.history ? opts.history.map((h) => ({ ...h })) : undefined,
      invalidReason: opts.invalidReason,
      coachHint: opts.coachHint,
    }),
  ) as string;
}

// ── L2 · output quarantine ───────────────────────────────────────────

export interface Quarantine {
  text: string; // sanitized text (safe to store / display)
  bytes: number; // raw byte count of the original
  violations: string[]; // policy violations observed
}

/** Sanitize raw model output: strip control chars, cap size. */
export function quarantineOutput(raw: string): Quarantine {
  const violations: string[] = [];
  const bytes = Buffer.byteLength(raw ?? "", "utf8");
  let text = (raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u2028|\u2029/g, " ");
  if ((raw ?? "").length > SANDBOX_POLICY.maxOutputChars) {
    violations.push(`output exceeded ${SANDBOX_POLICY.maxOutputChars} chars (truncated)`);
    text = text.slice(0, SANDBOX_POLICY.maxOutputChars);
  }
  if (/[\u0000-\u0008\u000E-\u001F]/.test(raw ?? "")) {
    violations.push("control characters stripped");
  }
  return { text, bytes, violations };
}

export interface ActionVerdict {
  ok: boolean;
  action: "" | "up" | "down" | "left" | "right" | "split";
  thought: string;
  violations: string[];
}

const ACTION_SET = new Set(["up", "down", "left", "right", "split"]);

/** Strict schema validation for a Thinker reply. */
export function parseActionReply(raw: string): ActionVerdict {
  const q = quarantineOutput(raw);
  const violations = [...q.violations];

  // JSON object extraction (fences tolerated, prose rejected)
  const cleaned = q.text.replace(/```(?:json)?/gi, "").trim();
  let obj: { thought?: unknown; action?: unknown } | null = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return {
      ok: false,
      action: "",
      thought: q.text.slice(0, 400),
      violations: [...violations, "reply is not a JSON object"],
    };
  }

  const action = typeof obj.action === "string" ? obj.action.toLowerCase().trim() : "";
  let thought = typeof obj.thought === "string" ? obj.thought.trim() : "";
  if (!ACTION_SET.has(action)) {
    violations.push(`action "${action.slice(0, 40) || "missing"}" not in {up,down,left,right,split}`);
  }
  if (!thought) {
    violations.push("thought field missing or empty");
    thought = q.text.slice(0, 400);
  }
  if (thought.length > SANDBOX_POLICY.maxThoughtChars) {
    violations.push(`thought exceeded ${SANDBOX_POLICY.maxThoughtChars} chars (truncated)`);
    thought = thought.slice(0, SANDBOX_POLICY.maxThoughtChars);
  }

  return {
    ok: ACTION_SET.has(action) && violations.length === 0,
    action: (ACTION_SET.has(action) ? action : "") as ActionVerdict["action"],
    thought,
    violations,
  };
}

/** Strict schema validation for a Reviewer reply. */
export function parseReviewReply(raw: string): {
  ok: boolean;
  review: {
    rating: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  } | null;
  violations: string[];
} {
  const q = quarantineOutput(raw);
  const violations = [...q.violations];
  const cleaned = q.text.replace(/```(?:json)?/gi, "").trim();
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, review: null, violations: [...violations, "reply is not a JSON object"] };
  }
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => String(x).slice(0, 300)) : [];
  const rating = typeof obj.rating === "number" ? Math.max(0, Math.min(10, Math.round(obj.rating))) : 0;
  if (typeof obj.rating !== "number") violations.push("rating missing (coerced to 0)");
  return {
    ok: violations.length === 0,
    review: {
      rating,
      summary: typeof obj.summary === "string" ? obj.summary.slice(0, 600) : "",
      strengths: strArr(obj.strengths),
      weaknesses: strArr(obj.weaknesses),
      suggestions: strArr(obj.suggestions),
    },
    violations,
  };
}

// ── L3 · resource limits ─────────────────────────────────────────────

/** Compose an operator abort signal with the sandbox timeout. */
export function sandboxSignal(external: AbortSignal | undefined): AbortSignal {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error("SANDBOX TIMEOUT")), SANDBOX_POLICY.callTimeoutMs);
  if (external) {
    if (external.aborted) clearTimeout(timer), ctl.abort(external.reason);
    else external.addEventListener("abort", () => {
      clearTimeout(timer);
      ctl.abort(external.reason);
    }, { once: true });
  }
  // keep the timer from holding the event loop open
  ctl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return ctl.signal;
}

// ── audit ────────────────────────────────────────────────────────────

export interface SandboxAudit {
  layer: "L1-firewall" | "L2-quarantine" | "L3-limits" | "L4-secrets" | "L5-replay";
  bytesIn: number; // observation size
  bytesOut: number; // raw reply size
  latencyMs: number;
  verdict: "CLEAN" | "VIOLATIONS" | "ERROR";
  violations: string[];
  provider: string;
  model: string;
  /** v3: which retries / fallbacks carried this call (present only when
   *  the reliability engine had to work — clean single attempts stay lean). */
  reliability?: {
    degraded: boolean;
    attempts: number;
    rateWaitMs: number;
    tokensIn: number;
    tokensOut: number;
    trail: string[];
  };
}

export function auditRecord(partial: Partial<SandboxAudit> & { verdict: SandboxAudit["verdict"] }): SandboxAudit {
  return {
    layer: "L2-quarantine",
    bytesIn: 0,
    bytesOut: 0,
    latencyMs: 0,
    violations: [],
    provider: "",
    model: "",
    ...partial,
  };
}
