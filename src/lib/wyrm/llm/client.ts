// ── WYRM.LAB · unified multi-provider LLM client (SERVER ONLY) ──────
// One call, any provider. v3 wraps the raw transports in a production
// reliability pipeline modelled on LiteLLM / OpenRouter gateways:
//
//   fallback chain → circuit gate → rate limiter (RPM/TPM/slots) →
//   context fitter → timeout → classified retries (Retry-After aware)
//
// Every wire attempt is recorded in an attempt log that rides on the
// result, streams tokens (text + thinking) through onDelta so the
// control room can render the model's mind live, and honours
// AbortSignal so the operator can INTERRUPT mid-generation.

import ZAI from "z-ai-web-dev-sdk";
import type { ChatMessage } from "z-ai-web-dev-sdk";
import type {
  AttemptRecord,
  ChatMsg,
  DeltaEvent,
  ErrorClass,
  LLMResult,
  LLMTarget,
} from "./types";
import { ENGINE_DEFAULTS, PROVIDER_KINDS } from "./types";
import { classifyThrown, LLMApiError, backoffDelay, parseRetryAfter } from "./resilience";
import { acquire, circuitAllows, circuitRecordFailure, circuitRecordSuccess, release, sleepAbortable } from "./ratelimiter";
import { estimateMessagesTokens, estimateTokens, fitToContext, resolveContextWindow } from "./tokens";
import { mcpChat } from "./mcp";

export interface ChatOpts {
  signal?: AbortSignal;
  onDelta?: (d: DeltaEvent) => void;
  retries?: number; // per-provider override of the retry budget
  fallbacks?: LLMTarget[]; // failover chain after `target`
  role?: string; // telemetry tag only
}

/** Resolved per-provider runtime config (engine defaults filled in). */
interface ResolvedCfg {
  contextWindow: number;
  rpm: number;
  tpm: number;
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
}

function resolveCfg(t: LLMTarget, retriesOverride?: number): ResolvedCfg {
  const meta = PROVIDER_KINDS[t.kind] ?? PROVIDER_KINDS.custom;
  return {
    contextWindow: resolveContextWindow(t.contextWindow, meta.contextHint),
    rpm: t.rpm ?? 0,
    tpm: t.tpm ?? 0,
    concurrency: t.concurrency ?? 0,
    timeoutMs: t.timeoutMs && t.timeoutMs >= 1000 ? t.timeoutMs : ENGINE_DEFAULTS.timeoutMs,
    maxRetries: retriesOverride ?? (t.maxRetries && t.maxRetries >= 0 ? t.maxRetries : ENGINE_DEFAULTS.maxRetries),
    retryBaseMs: t.retryBaseMs && t.retryBaseMs >= 50 ? t.retryBaseMs : ENGINE_DEFAULTS.retryBaseMs,
  };
}

/** One uniform entry point for every provider — full reliability pipeline. */
export async function llmChat(target: LLMTarget, messages: ChatMsg[], opts: ChatOpts = {}): Promise<LLMResult> {
  const chain = [target, ...(opts.fallbacks ?? [])];
  const t0 = Date.now();
  const attempts: AttemptRecord[] = [];
  let rateWaitTotal = 0;
  let lastError = "";
  let lastErrorClass: ErrorClass | undefined;
  let degradedAnswered = false;

  for (let ci = 0; ci < chain.length; ci++) {
    const cand = chain[ci];
    const cfg = resolveCfg(cand, opts.retries);
    const key = cand.name; // Provider.name is unique — the limiter/breaker key

    // ── circuit breaker gate ─────────────────────────────────────────
    if (!circuitAllows(key)) {
      attempts.push({
        provider: cand.name,
        model: cand.modelId,
        attempt: 0,
        degraded: ci > 0,
        skipped: "circuit_open",
        ok: false,
        latencyMs: 0,
        errorClass: "rate_limit",
        error: "circuit open — provider in cooldown, failover",
      });
      continue; // straight to the next fallback
    }

    // ── context fitting (per candidate: windows differ) ──────────────
    let fit = fitToContext(messages, {
      contextWindow: cfg.contextWindow,
      reserveOut: cand.maxTokens,
    });

    let attemptNo = 0; // retry index within this provider
    let contextRetried = false;

    // ── retry loop for this candidate ───────────────────────────────
    for (;;) {
      if (opts.signal?.aborted) return aborted(target, t0, attempts, rateWaitTotal);

      // rate limiter (RPM / TPM / concurrency) — abort-aware
      const rateWait = await acquire(key, {
        rpm: cfg.rpm,
        tpm: cfg.tpm,
        estTokens: fit.estimatedTokens + cand.maxTokens,
        concurrency: cfg.concurrency,
        signal: opts.signal,
      });
      rateWaitTotal += rateWait;
      if (opts.signal?.aborted) {
        release(key);
        return aborted(target, t0, attempts, rateWaitTotal);
      }

      const attemptStart = Date.now();
      const rec: AttemptRecord = {
        provider: cand.name,
        model: cand.modelId,
        attempt: attemptNo,
        degraded: ci > 0,
        ok: false,
        latencyMs: 0,
        rateWaitMs: rateWait,
        contextTruncated: fit.truncated,
        tokensIn: fit.estimatedTokens,
      };
      attempts.push(rec);

      try {
        const res = await executeOnce(cand, fit.messages, opts, cfg.timeoutMs);
        release(key);
        circuitRecordSuccess(key);
        rec.ok = true;
        rec.latencyMs = Date.now() - attemptStart;
        const tokensOut = estimateTokens(res.text) + estimateTokens(res.thinking);
        degradedAnswered = ci > 0;
        return {
          ...res,
          latencyMs: Date.now() - t0,
          attempts,
          degraded: degradedAnswered,
          tokensIn: fit.estimatedTokens,
          tokensOut,
          rateWaitMs: rateWaitTotal,
        };
      } catch (e) {
        release(key);
        rec.latencyMs = Date.now() - attemptStart;
        const timedOut = (e as { __timedOut?: boolean })?.__timedOut === true;
        const cls = classifyThrown(e, timedOut);
        rec.errorClass = cls.cls;
        rec.error = cls.message;
        lastError = cls.message;
        lastErrorClass = cls.cls;

        // operator interrupt — stop the whole chain, no fallback
        if (cls.cls === "aborted") {
          return {
            ok: false,
            text: "",
            thinking: "",
            latencyMs: Date.now() - t0,
            error: "INTERRUPTED by operator",
            errorClass: "aborted",
            model: cand.modelId,
            provider: cand.name,
            attempts,
            rateWaitMs: rateWaitTotal,
          };
        }

        // context overflow: re-fit SMALLER and retry once on this provider
        if (cls.cls === "context" && !contextRetried) {
          contextRetried = true;
          const shrunk = fitToContext(messages, {
            contextWindow: Math.max(2048, Math.floor(cfg.contextWindow * 0.6)),
            reserveOut: cand.maxTokens,
          });
          fit = shrunk;
          continue; // immediate retry (no backoff — payload changed)
        }

        // terminal for this provider?
        const budgetExhausted = attemptNo >= cfg.maxRetries;
        if (!cls.retryable || budgetExhausted) {
          circuitRecordFailure(key, {
            errorClass: cls.cls,
            error: cls.message,
          });
          break; // → next fallback
        }

        // backoff (Retry-After aware) and retry
        const delay = backoffDelay(attemptNo, cfg.retryBaseMs, cls.cls, cls.retryAfterMs);
        rec.backoffMs = delay;
        attemptNo++;
        await sleepAbortable(delay, opts.signal);
      }
    }
  }

  // whole chain exhausted
  return {
    ok: false,
    text: "",
    thinking: "",
    latencyMs: Date.now() - t0,
    error: lastError || "all providers failed",
    errorClass: lastErrorClass,
    model: target.modelId,
    provider: target.name,
    attempts,
    degraded: degradedAnswered,
    rateWaitMs: rateWaitTotal,
  };
}

function aborted(target: LLMTarget, t0: number, attempts: AttemptRecord[], rateWaitMs: number): LLMResult {
  return {
    ok: false,
    text: "",
    thinking: "",
    latencyMs: Date.now() - t0,
    error: "INTERRUPTED by operator",
    errorClass: "aborted",
    model: target.modelId,
    provider: target.name,
    attempts,
    rateWaitMs,
  };
}

/** Run a single attempt against one provider (raw transports + timeout). */
async function executeOnce(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: ChatOpts,
  timeoutMs: number,
): Promise<Omit<LLMResult, "attempts" | "degraded" | "tokensIn" | "tokensOut" | "rateWaitMs">> {
  const meta = PROVIDER_KINDS[target.kind] ?? PROVIDER_KINDS.custom;
  const t0 = Date.now();
  if (meta.protocol === "zai") {
    return zaiChat(target, messages, opts, t0, timeoutMs);
  }

  // combine the operator signal with our own timeout
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  const onOuterAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    switch (meta.protocol) {
      case "openai-compat":
        return await openaiCompatChat(target, messages, opts, t0, ctl.signal);
      case "anthropic":
        return await anthropicChat(target, messages, opts, t0, ctl.signal);
      case "google":
        return await googleChat(target, messages, opts, t0, ctl.signal);
      case "mcp":
        // MCP manages its own per-request deadline inside the transport;
        // the outer signal still aborts in-flight calls mid-generation.
        return await mcpChat(target, messages, opts, t0, timeoutMs);
      default:
        throw new LLMApiError(`unsupported protocol ${meta.protocol}`, 0, "");
    }
  } catch (e) {
    if (timedOut && (e as Error).name === "AbortError") {
      // re-tag so classifyThrown sees a timeout, not an interrupt
      const tagged = e as Error & { __timedOut?: boolean };
      tagged.__timedOut = true;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

// ── built-in sandbox SDK ─────────────────────────────────────────────
let zaiClient: ZAI | null = null;
async function getZai(): Promise<ZAI> {
  if (!zaiClient) zaiClient = await ZAI.create();
  return zaiClient;
}

async function zaiChat(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: ChatOpts,
  t0: number,
  timeoutMs: number,
): Promise<Omit<LLMResult, "attempts" | "degraded" | "tokensIn" | "tokensOut" | "rateWaitMs">> {
  const zai = await getZai();
  const run = zai.chat.completions.create({
    model: target.modelId,
    messages: messages as ChatMessage[],
    thinking: { type: "disabled" },
    max_tokens: target.maxTokens,
    temperature: target.temperature,
  });
  // SDK has no signal support — race against the timeout
  const guard = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      const e = new Error(`request timed out after ${timeoutMs}ms`) as Error & { __timedOut?: boolean };
      e.__timedOut = true;
      reject(e);
    }, timeoutMs);
    opts.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
  const res: any = await Promise.race([run, guard]);
  const text: string = res?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LLMApiError("empty completion", 0, "empty completion");
  opts.onDelta?.({ text }); // single-shot delta: SDK is not streaming
  return {
    ok: true,
    text,
    thinking: "",
    latencyMs: Date.now() - t0,
    model: target.modelId,
    provider: target.name,
  };
}

// ── SSE line reader (shared by all HTTP protocols) ───────────────────
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      // SSE events are separated by a blank line
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of chunk.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
        }
      }
    }
    // flush trailing event without blank line
    for (const line of buf.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
    }
  } finally {
    reader.releaseLock();
  }
}

/** Throw a classified LLMApiError from a non-2xx HTTP response. */
async function httpError(res: Response): Promise<never> {
  const body = await safeText(res, 400);
  throw new LLMApiError(`${res.status} ${body}`, res.status, body, parseRetryAfter(res.headers.get("retry-after")));
}

// ── OpenAI-compatible (OpenAI, OpenRouter, Groq, DeepSeek, …) ────────
async function openaiCompatChat(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: ChatOpts,
  t0: number,
  signal: AbortSignal,
): Promise<Omit<LLMResult, "attempts" | "degraded" | "tokensIn" | "tokensOut" | "rateWaitMs">> {
  const url = joinUrl(target.baseUrl, "/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: target.modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: target.temperature,
      max_tokens: target.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) await httpError(res);
  if (!res.body) throw new LLMApiError("no response body", 0, "no response body");

  let text = "";
  let thinking = "";
  for await (const data of sseLines(res.body)) {
    if (data === "[DONE]") break;
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    if (ev.error) {
      const msg = ev.error.message ?? "stream error";
      throw new LLMApiError(msg, ev.error.code ?? 500, msg, parseRetryAfter(ev.error.retry_after));
    }
    const delta = ev.choices?.[0]?.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      opts.onDelta?.({ text: delta.content });
    }
    // DeepSeek-R1 style reasoning stream — captured as thinking
    const rc = delta.reasoning_content ?? delta.reasoning;
    if (typeof rc === "string" && rc) {
      thinking += rc;
      opts.onDelta?.({ thinking: rc });
    }
  }
  if (!text && !thinking) throw new LLMApiError("empty stream", 0, "empty stream");
  return {
    ok: true,
    text,
    thinking,
    latencyMs: Date.now() - t0,
    model: target.modelId,
    provider: target.name,
  };
}

// ── Anthropic Messages API ───────────────────────────────────────────
async function anthropicChat(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: ChatOpts,
  t0: number,
  signal: AbortSignal,
): Promise<Omit<LLMResult, "attempts" | "degraded" | "tokensIn" | "tokensOut" | "rateWaitMs">> {
  const url = joinUrl(target.baseUrl, "/v1/messages");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": target.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: target.modelId,
      max_tokens: target.maxTokens,
      temperature: target.temperature,
      ...(system ? { system } : {}),
      messages: convo,
      stream: true,
    }),
  });
  if (!res.ok) await httpError(res);
  if (!res.body) throw new LLMApiError("no response body", 0, "no response body");

  let text = "";
  let thinking = "";
  for await (const data of sseLines(res.body)) {
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    if (ev.type === "error") {
      const msg = ev.error?.message ?? "stream error";
      throw new LLMApiError(msg, ev.error?.status ?? 500, msg);
    }
    if (ev.type === "content_block_delta") {
      const d = ev.delta ?? {};
      if (typeof d.text === "string" && d.text) {
        text += d.text;
        opts.onDelta?.({ text: d.text });
      }
      if (typeof d.thinking === "string" && d.thinking) {
        thinking += d.thinking;
        opts.onDelta?.({ thinking: d.thinking });
      }
    }
  }
  if (!text && !thinking) throw new LLMApiError("empty stream", 0, "empty stream");
  return {
    ok: true,
    text,
    thinking,
    latencyMs: Date.now() - t0,
    model: target.modelId,
    provider: target.name,
  };
}

// ── Google Generative Language API ───────────────────────────────────
async function googleChat(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: ChatOpts,
  t0: number,
  signal: AbortSignal,
): Promise<Omit<LLMResult, "attempts" | "degraded" | "tokensIn" | "tokensOut" | "rateWaitMs">> {
  const url =
    `${trimSlash(target.baseUrl)}/v1beta/models/${encodeURIComponent(target.modelId)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(target.apiKey)}`;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: target.temperature,
        maxOutputTokens: target.maxTokens,
      },
    }),
  });
  if (!res.ok) await httpError(res);
  if (!res.body) throw new LLMApiError("no response body", 0, "no response body");

  let text = "";
  for await (const data of sseLines(res.body)) {
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    const parts = ev?.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === "string" && p.text) {
        text += p.text;
        opts.onDelta?.({ text: p.text });
      }
    }
  }
  if (!text) throw new LLMApiError("empty stream", 0, "empty stream");
  return {
    ok: true,
    text,
    thinking: "",
    latencyMs: Date.now() - t0,
    model: target.modelId,
    provider: target.name,
  };
}

// ── helpers ──────────────────────────────────────────────────────────
function joinUrl(base: string, path: string): string {
  const b = trimSlash(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function safeText(res: Response, limit: number): Promise<string> {
  try {
    return (await res.text()).slice(0, limit);
  } catch {
    return "";
  }
}

export { estimateMessagesTokens, estimateTokens };
