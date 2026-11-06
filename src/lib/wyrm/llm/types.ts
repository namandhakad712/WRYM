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
  | "moonshot" // Moonshot AI — Kimi K-series (verified: platform.kimi.ai)
  | "minimax" // MiniMax M-series (verified: platform.minimax.io)
  | "dashscope" // Alibaba Model Studio / DashScope — Qwen family
  | "zhipu" // Z.ai / Zhipu BigModel — GLM family (free Flash tier)
  | "piapi" // PiAPI — one-key aggregator bundle (GPT/Claude/DeepSeek/Gemini)
  | "nvidia" // NVIDIA NIM — build.nvidia.com evaluation endpoint
  | "cloudflare" // Cloudflare Workers AI (neuron-priced, edge)
  | "cohere" // Cohere compatibility endpoint (trial keys)
  | "siliconflow" // SiliconFlow — open-weight models, CN
  | "ollama" // local
  | "lmstudio" // local
  | "mcp" // any Model Context Protocol server — see lib/wyrm/llm/mcp.ts
  | "custom"; // any OpenAI-compatible endpoint

export type Protocol = "zai" | "openai-compat" | "anthropic" | "google" | "mcp";

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
  moonshot: {
    label: "Moonshot (Kimi)",
    protocol: "openai-compat",
    // verified on platform.kimi.ai/docs/api/overview — OpenAI Chat Completions base
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    needsKey: true,
    keyPattern: "sk-…",
    modelHint: "kimi-k3.1-pro / kimi-k3 (1M context)",
    note:
      "Kimi K-series — 3T-class open flagship with a 1M-token window. OpenAI-compatible; " +
      "an Anthropic-compatible surface also exists at /anthropic. reasoning_content streams are captured as thinking.",
    contextHint: 1_000_000,
  },
  minimax: {
    label: "MiniMax",
    protocol: "openai-compat",
    // verified on platform.minimax.io/docs/api-reference/text-openai-api
    defaultBaseUrl: "https://api.minimax.io/v1",
    needsKey: true,
    modelHint: "MiniMax-M3.1-Flash / MiniMax-M3 (1M context)",
    note:
      "Frontier multimodal coding models with 1M-token windows. OpenAI-compatible; " +
      "reasoning_content deltas are captured as thinking. Pay-as-you-go keys from the platform console.",
    contextHint: 1_000_000,
  },
  dashscope: {
    label: "Alibaba Model Studio (Qwen)",
    protocol: "openai-compat",
    // international portal; CN accounts use https://dashscope.aliyuncs.com/compatible-mode/v1
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    needsKey: true,
    keyPattern: "sk-…",
    modelHint: "qwen-plus / qwen3-max — see the Model Studio model list",
    note:
      "Alibaba's Qwen family over the OpenAI-compatible DashScope endpoint. International " +
      "base by default; CN accounts switch to dashscope.aliyuncs.com/compatible-mode/v1.",
    contextHint: 131_072,
  },
  zhipu: {
    label: "Z.ai / Zhipu (GLM)",
    protocol: "openai-compat",
    // international portal (email signup): https://api.z.ai/api/paas/v4
    // CN portal open.bigmodel.cn (Chinese phone): same path, different host
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    needsKey: true,
    keyPattern: "<id>.<secret>",
    modelHint: "glm-4.7-flash / glm-4.5-flash (FREE) / glm-5.3…",
    note:
      "Zhipu's GLM family. The Flash line (glm-4.7-flash, glm-4.5-flash) is a PERMANENT FREE tier — " +
      "no card, email-only signup on z.ai. OpenAI-compatible. Concurrency is low on free keys — set rpm ≤ 10.",
    contextHint: 200_000,
  },
  piapi: {
    label: "PiAPI (bundle)",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.piapi.ai/v1",
    needsKey: true,
    modelHint: "gpt-5.2 / claude-sonnet-4-6 / deepseek-…",
    note:
      "One-key aggregator: GPT-5.x, Claude 4.6, DeepSeek, Gemini and more behind one OpenAI-compatible " +
      "endpoint at 10–75% of list price. The cheapest way to bench frontier models side by side.",
    contextHint: 128_000,
  },
  nvidia: {
    label: "NVIDIA NIM",
    protocol: "openai-compat",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    keyPattern: "nvapi-…",
    modelHint: "nvidia/nemotron-3-ultra-550b-a55b, openai/gpt-oss-120b, moonshotai/kimi-k3…",
    note:
      "build.nvidia.com evaluation endpoint — 80+ open models, phone verification, no card, up to 40 rpm. " +
      "Meant for evaluation (like this benchmark), not production traffic.",
    contextHint: 128_000,
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1",
    needsKey: true,
    keyPattern: "Bearer API token",
    modelHint: "@cf/meta/llama-3.3-70b-instruct-fp8-fast, @cf/openai/gpt-oss-120b…",
    note:
      "50+ open models at the edge, priced in neurons (10,000/day free). Replace <ACCOUNT_ID> in the base URL.",
    contextHint: 32_768,
  },
  cohere: {
    label: "Cohere",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.cohere.ai/compatibility/v1",
    needsKey: true,
    modelHint: "command-r-plus-08-2024 / command-a-…",
    note: "Trial keys: 20 rpm, 1,000 requests/month, non-commercial. OpenAI-compatible endpoint.",
    contextHint: 128_000,
  },
  siliconflow: {
    label: "SiliconFlow",
    protocol: "openai-compat",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    needsKey: true,
    modelHint: "Qwen/Qwen2.5-7B-Instruct (¥0), deepseek-ai/…",
    note: "CN-hosted open-weight models; a rotating set is priced at ¥0. Check the console for the current free lineup.",
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
  mcp: {
    label: "MCP server (any model)",
    protocol: "mcp",
    defaultBaseUrl: "",
    needsKey: false,
    modelHint: "model id forwarded to the server (optional)",
    note:
      "Model Context Protocol — plug in ANY model exposed as an MCP tool. " +
      "baseUrl: 'stdio:<command + args>' to launch a local server, or an https://…/mcp URL for a remote one; " +
      "append '#tool=name' to pin the tool (else auto-discovered). " +
      "apiKey: 'KEY=value;KEY2=value' env for stdio, or a bearer token for HTTP. " +
      "See docs/MCP_SUPPORT.md — the zero-dep bridge mcp/llm-bridge.mjs wraps any OpenAI-compatible endpoint.",
    contextHint: 128_000,
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
