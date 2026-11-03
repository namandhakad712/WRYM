// ── WYRM.LAB · LLM provider registry (pi-style) ─────────────────────
// Inspired by earendil-works/pi: one uniform target spec drives every
// provider — any vendor, any base URL, any model. The admin dashboard
// writes rows in the Provider table; this registry knows how to talk
// to each protocol family.
//
// v3 adds the resilience block: per-provider context window, rate
// limits (RPM/TPM/concurrency), timeout, retry budget, backoff base,
// fallback chain and cost tracking — every knob above maps 1:1 to a
// Provider column and is editable from the admin console.

export type ProviderKind =
  | "zai" // built-in sandbox SDK (zero-config fallback)
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "groq"
  | "deepseek"
  | "mistral"
  | "xai"
  | "together"
  | "ollama" // local
  | "lmstudio" // local
  | "custom"; // any OpenAI-compatible endpoint

export type Protocol = "zai" | "openai-compat" | "anthropic" | "google";

export interface ProviderKindMeta {
  label: string;
  protocol: Protocol;
  defaultBaseUrl: string;
  needsKey: boolean;
  keyPattern?: string;
  modelHint: string;
  note: string;
  /** Conservative context-window hint (tokens) used when the admin
   *  leaves contextWindow = 0 ("auto"). Always overridable. */
  contextHint: number;
}

export const PROVIDER_KINDS: Record<ProviderKind, ProviderKindMeta> = {
  zai: {
    label: "Built-in (GLM)",
    protocol: "zai",
    defaultBaseUrl: "",
    needsKey: false,
    modelHint: "glm-4.6",
    note: "Zero-config model bundled with this sandbox. The default brain when nothing else is configured.",
    contextHint: 128_000,
  },
  openai: {
    label: "OpenAI",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsKey: true,
    keyPattern: "sk-…",
    modelHint: "gpt-4o / gpt-4o-mini / o3-mini",
    note: "Chat Completions API with SSE streaming.",
    contextHint: 128_000,
  },
  anthropic: {
    label: "Anthropic",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    needsKey: true,
    keyPattern: "sk-ant-…",
    modelHint: "claude-sonnet-4-5 / claude-opus-4-1",
    note: "Messages API; system prompt is sent separately. Extended-thinking deltas are captured as thoughts.",
    contextHint: 200_000,
  },
  google: {
    label: "Google AI",
    protocol: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    keyPattern: "AIza…",
    modelHint: "gemini-2.5-pro / gemini-2.5-flash",
    note: "Generative Language API (streamGenerateContent, SSE).",
    contextHint: 1_000_000,
  },
  openrouter: {
    label: "OpenRouter",
    protocol: "openai-compat",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyPattern: "sk-or-…",
    modelHint: "anthropic/claude-sonnet-4.5, openai/gpt-4o, …",
    note: "One key, hundreds of models — the fastest way to widen the arena.",
    contextHint: 200_000,
  },
  groq: {
    label: "Groq",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    keyPattern: "gsk_…",
    modelHint: "llama-3.3-70b-versatile / qwen-…",
    note: "Ultra-low-latency inference, OpenAI-compatible. Rate limits are strict — set RPM/TPM.",
    contextHint: 128_000,
  },
  deepseek: {
    label: "DeepSeek",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
    keyPattern: "sk-…",
    modelHint: "deepseek-chat / deepseek-reasoner",
    note: "Reasoner models stream reasoning_content — recorded as thinking.",
    contextHint: 64_000,
  },
  mistral: {
    label: "Mistral",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    modelHint: "mistral-large-latest / codestral-…",
    note: "OpenAI-compatible endpoint.",
    contextHint: 128_000,
  },
  xai: {
    label: "xAI",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.x.ai/v1",
    needsKey: true,
    modelHint: "grok-4 / grok-3-mini",
    note: "Grok models, OpenAI-compatible.",
    contextHint: 131_000,
  },
  together: {
    label: "Together",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.together.xyz/v1",
    needsKey: true,
    modelHint: "meta-llama/…",
    note: "Open-source model hub, OpenAI-compatible.",
    contextHint: 32_768,
  },
  ollama: {
    label: "Ollama (local)",
    protocol: "openai-compat",
    defaultBaseUrl: "http://localhost:11434/v1",
    needsKey: false,
    modelHint: "qwen2.5:14b / llama3.1:8b",
    note: "Fully local, no key needed. Set the context window to what your model actually loads.",
    contextHint: 8_192,
  },
  lmstudio: {
    label: "LM Studio (local)",
    protocol: "openai-compat",
    defaultBaseUrl: "http://localhost:1234/v1",
    needsKey: false,
    modelHint: "whatever model you loaded",
    note: "Fully local, no key needed. Set the context window to what your model actually loads.",
    contextHint: 8_192,
  },
  custom: {
    label: "Custom endpoint",
    protocol: "openai-compat",
    defaultBaseUrl: "",
    needsKey: false,
    modelHint: "your model id",
    note: "Any OpenAI-compatible server: vLLM, LiteLLM, llama.cpp server, an internal gateway…",
    contextHint: 8_192,
  },
};

export const PROVIDER_KIND_LIST = Object.keys(PROVIDER_KINDS) as ProviderKind[];

/** Engine-wide defaults; a Provider row overrides each with a non-zero value. */
export const ENGINE_DEFAULTS = {
  maxRetries: 3, // retry budget per request, per provider
  retryBaseMs: 800, // exponential backoff base
  retryCapMs: 30_000, // backoff ceiling (per-attempt)
  rateCapMs: 60_000, // rate-limit backoff ceiling
  timeoutMs: 120_000, // per-request hard timeout
  contextSafety: 256, // tokens kept free on top of maxTokens
  circuitThreshold: 5, // consecutive failures before the breaker opens
  circuitCooldownMs: 30_000, // open-circuit cooldown (generic failures)
  quotaCooldownMs: 600_000, // quota/billing trips → 10-minute cooldown
  limiterWindowMs: 60_000, // sliding window for RPM/TPM
} as const;

/** A fully-resolved chat target (one row of the Provider table). */
export interface LLMTarget {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  // ── resilience knobs (0/undefined ⇒ engine default) ───────────────
  contextWindow?: number; // custom context size in tokens; 0/undef = auto (kind hint)
  rpm?: number; // requests per minute (client-side limiter)
  tpm?: number; // tokens per minute (client-side limiter)
  concurrency?: number; // max parallel in-flight requests
  timeoutMs?: number; // per-request hard timeout
  maxRetries?: number; // retry budget
  retryBaseMs?: number; // backoff base
  costPerMtok?: number; // blended USD per 1M tokens (tracking)
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── error taxonomy (shared by client, resilience, UI) ────────────────
export type ErrorClass =
  | "rate_limit" // 429 without billing cause → back off, retry
  | "quota" // quota / billing exhausted → fail over + long cooldown
  | "auth" // 401/403 → config problem, fail over
  | "context" // context window exceeded → shrink + retry / fail over
  | "server" // 5xx → retry with backoff
  | "network" // DNS / reset / fetch failed → retry with backoff
  | "timeout" // per-request timeout → retry with backoff
  | "invalid" // 400/404 that is not context-related → fail over
  | "aborted" // operator interrupt → stop immediately
  | "unknown";

/** One wire attempt (or skip) inside a single logical LLM call. */
export interface AttemptRecord {
  provider: string;
  model: string;
  attempt: number; // retry # within this provider (0 = first try)
  degraded: boolean; // true when this is a fallback provider
  skipped?: "circuit_open"; // recorded without hitting the wire
  ok: boolean;
  latencyMs: number;
  errorClass?: ErrorClass;
  error?: string;
  backoffMs?: number; // delay injected before this attempt
  rateWaitMs?: number; // time spent waiting in the rate limiter
  contextTruncated?: boolean;
  tokensIn?: number;
}

export interface LLMResult {
  ok: boolean;
  text: string;
  thinking: string; // captured reasoning/reasoning_content stream
  latencyMs: number;
  error?: string;
  errorClass?: ErrorClass;
  model: string;
  provider: string;
  // ── reliability telemetry (v3) ─────────────────────────────────────
  attempts?: AttemptRecord[]; // full per-attempt log
  degraded?: boolean; // answered by a fallback provider
  tokensIn?: number; // estimated prompt tokens
  tokensOut?: number; // estimated completion tokens
  rateWaitMs?: number; // total limiter wait
  costUsd?: number; // estimated spend
}

export interface DeltaEvent {
  text?: string;
  thinking?: string;
}
