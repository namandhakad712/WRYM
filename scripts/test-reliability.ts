// Smoke-test the v3 reliability pipeline end-to-end (built-in provider):
// fallback chain, token accounting, attempt logging and telemetry rows.
import { chat } from "../src/lib/wyrm/agents/llm";
import { llmChat } from "../src/lib/wyrm/llm/client";
import { fitToContext, estimateTokens } from "../src/lib/wyrm/llm/tokens";
import { circuitSnapshotAll, limiterStats } from "../src/lib/wyrm/llm/ratelimiter";
import { classifyHttp, backoffDelay } from "../src/lib/wyrm/llm/resilience";
import { db } from "../src/lib/db";

async function main() {
  // 1 ── unit-level checks
  const est = estimateTokens("hello world 你好世界 " + "x".repeat(400));
  console.log("[tokens] estimate:", est);

  const msgs = [
    { role: "system" as const, content: "S".repeat(200) },
    { role: "user" as const, content: "u1 " + "a".repeat(3000) },
    { role: "assistant" as const, content: "a1 " + "b".repeat(3000) },
    { role: "user" as const, content: "u2 " + "c".repeat(3000) },
    { role: "assistant" as const, content: "a2 " + "d".repeat(3000) },
    { role: "user" as const, content: "FINAL OBSERVATION (must survive)" },
  ];
  const fit = fitToContext(msgs, { contextWindow: 4096, reserveOut: 1024 });
  console.log("[fit] truncated:", fit.truncated, "| dropped turns:", fit.droppedTurns, "| est:", fit.estimatedTokens, "/", fit.budget);
  console.log("[fit] last msg intact:", fit.messages[fit.messages.length - 1].content.includes("must survive"));
  console.log("[fit] marker present:", fit.messages.some((m) => m.content.includes("context truncated")));

  const c429 = classifyHttp(429, "Too many requests", 2500);
  const cQuota = classifyHttp(429, "You exceeded your current quota");
  const cCtx = classifyHttp(400, "This model's maximum context length is 4096 tokens");
  const cAuth = classifyHttp(401, "invalid api key");
  console.log("[classify] 429 →", c429.cls, "retryable:", c429.retryable, "retryAfter:", c429.retryAfterMs);
  console.log("[classify] 429-quota →", cQuota.cls, "failover:", cQuota.failover);
  console.log("[classify] 400-context →", cCtx.cls);
  console.log("[classify] 401 →", cAuth.cls, "retryable:", cAuth.retryable);
  console.log("[backoff] attempt0 rate_limit:", backoffDelay(0, 800, "rate_limit", undefined), "ms (jittered)");
  console.log("[backoff] attempt2 server:", backoffDelay(2, 800, "server"), "ms (jittered)");

  // 2 ── live call through the whole pipeline (built-in GLM)
  const r = await chat([{ role: "user", content: 'Reply with exactly: {"thought":"reliability check","action":"up"}' }], { retries: 1 });
  console.log("\n[chat] ok:", r.ok, "| latency:", r.latencyMs, "ms | provider:", r.provider, r.model);
  console.log("[chat] text:", r.text.slice(0, 160));
  console.log("[chat] tokens in/out:", r.tokensIn, "/", r.tokensOut, "| attempts:", r.attempts?.length, "| degraded:", r.degraded);
  if (r.error) console.log("[chat] error:", r.error, r.errorClass);

  // 3 ── quota-failover simulation: a dead endpoint with built-in fallback
  const dead = {
    name: "sim-dead-endpoint",
    kind: "custom" as const,
    baseUrl: "http://127.0.0.1:9/v1", // nothing listens here
    apiKey: "",
    modelId: "ghost-model",
    temperature: 0,
    maxTokens: 32,
    maxRetries: 1,
    retryBaseMs: 100,
    timeoutMs: 1500,
  };
  const alive = {
    name: "Built-in (GLM)",
    kind: "zai" as const,
    baseUrl: "",
    apiKey: "",
    modelId: "glm-4.6",
    temperature: 0,
    maxTokens: 32,
  };
  const t0 = Date.now();
  const fr = await llmChat(dead, [{ role: "user", content: "ping" }], { fallbacks: [alive], retries: 0 });
  console.log("\n[failover] ok:", fr.ok, "| answered by:", fr.provider, "| degraded:", fr.degraded, "| took:", Date.now() - t0, "ms");
  console.log("[failover] attempt trail:");
  for (const a of fr.attempts ?? []) {
    console.log("   ", a.provider, a.ok ? "✓" : `✗ ${a.errorClass}`, a.latencyMs + "ms");
  }

  // 4 ── runtime state + telemetry rows
  console.log("\n[circuits]", JSON.stringify(Object.keys(circuitSnapshotAll())));
  console.log("[limiters]", JSON.stringify(limiterStats()));
  const rows = await db.llmCall.findMany({ orderBy: { ts: "desc" }, take: 5 });
  console.log("[telemetry] rows:", rows.length, "| latest:", rows[0]?.provider, rows[0]?.ok ? "ok" : "err", rows[0]?.attempts, "attempts");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
