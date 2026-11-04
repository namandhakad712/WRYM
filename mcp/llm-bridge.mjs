#!/usr/bin/env node
// ── WRYM · mcp/llm-bridge.mjs — zero-dep MCP server for ANY model ────
// Turns any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server,
// LiteLLM, OpenAI, OpenRouter, Groq, an internal gateway…) into an MCP
// server exposing one tool: `chat`. The WRYM arena (or any MCP client)
// can then benchmark that model with zero code changes.
//
// RUN:
//   LLM_BASE_URL=http://localhost:11434/v1 \
//   LLM_MODEL=qwen2.5:14b \
//   node mcp/llm-bridge.mjs
//
// ENV:
//   LLM_BASE_URL     endpoint root (required — must serve POST /chat/completions)
//   LLM_API_KEY      sent as Authorization: Bearer … (optional, local servers don't need it)
//   LLM_MODEL        default model id (optional; the client's "model" arg wins)
//   LLM_TIMEOUT_MS   per-request timeout (default 120000)
//
// PROTOCOL: MCP over stdio — newline-delimited JSON-RPC 2.0.
// TOOL CONTRACT (what WRYM sends):
//   { system, messages: [{role, content}], model?, temperature?, max_tokens? }
// RESULT:
//   content: [{type:"text", text: "<model output>"}]
//   structuredContent: { text, thinking? }   (thinking = reasoning_content)
//
// This file is deliberately dependency-free: node >= 18, nothing else.

import { createInterface } from "node:readline";

const BASE_URL = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";
const DEFAULT_MODEL = process.env.LLM_MODEL || "";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 120_000);

const log = (...a) => process.stderr.write(`[llm-bridge] ${a.join(" ")}\n`);

if (!BASE_URL) {
  log("FATAL: LLM_BASE_URL is not set — point it at an OpenAI-compatible endpoint, e.g. http://localhost:11434/v1");
  process.exit(1);
}

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    system: { type: "string", description: "System prompt (optional)" },
    messages: {
      type: "array",
      description: "Conversation history",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["user", "assistant", "system"] },
          content: { type: "string" },
        },
        required: ["role", "content"],
      },
    },
    model: { type: "string", description: "Model id (overrides LLM_MODEL)" },
    temperature: { type: "number", description: "Sampling temperature" },
    max_tokens: { type: "integer", description: "Output token cap" },
  },
  required: ["messages"],
};

function rpcResult(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function rpcError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

async function callUpstream(args) {
  const messages = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  for (const m of args.messages ?? []) {
    if (m && typeof m.role === "string" && typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  if (!messages.length) throw new Error("no messages given");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: args.model || DEFAULT_MODEL,
        messages,
        temperature: typeof args.temperature === "number" ? args.temperature : 0.4,
        max_tokens: args.max_tokens ?? 1024,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`upstream ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message ?? {};
    const text = typeof msg.content === "string" ? msg.content : "";
    const thinking =
      typeof msg.reasoning_content === "string"
        ? msg.reasoning_content
        : typeof msg.reasoning === "string"
          ? msg.reasoning
          : "";
    if (!text && !thinking) throw new Error("upstream returned no content");
    return { text, thinking, model: data?.model || args.model || DEFAULT_MODEL };
  } finally {
    clearTimeout(timer);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let req;
  try {
    req = JSON.parse(s);
  } catch {
    log("ignoring non-JSON line:", s.slice(0, 80));
    return;
  }
  if (req.id === undefined) return; // notification — nothing to answer

  switch (req.method) {
    case "initialize":
      rpcResult(req.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "wyrm-llm-bridge", version: "1.0.0", title: "WRYM LLM Bridge" },
        instructions:
          "Bridges any OpenAI-compatible endpoint into MCP. Tool `chat` takes {system, messages, model, temperature, max_tokens} and returns the model output.",
      });
      break;

    case "tools/list":
      rpcResult(req.id, {
        tools: [
          {
            name: "chat",
            description: "Send a chat conversation to the underlying model and get its reply.",
            inputSchema: TOOL_SCHEMA,
          },
        ],
      });
      break;

    case "tools/call": {
      const name = req.params?.name;
      const args = req.params?.arguments ?? {};
      if (name !== "chat") {
        rpcError(req.id, -32602, `unknown tool "${name}" — this bridge exposes only "chat"`);
        break;
      }
      callUpstream(args)
        .then(({ text, thinking, model }) => {
          log(`chat ok (${model}) — ${text.length} chars`);
          rpcResult(req.id, {
            content: [{ type: "text", text: text || thinking }],
            structuredContent: { text, thinking },
          });
        })
        .catch((e) => {
          log("chat failed:", e.message);
          rpcResult(req.id, {
            content: [{ type: "text", text: `llm-bridge error: ${e.message}` }],
            isError: true,
          });
        });
      break;
    }

    case "ping":
      rpcResult(req.id, {});
      break;

    case "resources/list":
      rpcResult(req.id, { resources: [] });
      break;

    case "prompts/list":
      rpcResult(req.id, { prompts: [] });
      break;

    default:
      rpcError(req.id, -32601, `method not found: ${req.method}`);
  }
});

rl.on("close", () => {
  log("stdin closed — shutting down");
  process.exit(0);
});

log(`ready — bridging ${BASE_URL} (model: ${DEFAULT_MODEL || "client-specified"})`);
