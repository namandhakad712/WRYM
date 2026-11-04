# MCP Support — add ANY model to the WRYM arena

**MCP (Model Context Protocol)** is the open standard for connecting models to
tools. WRYM inverts it: instead of giving a model tools, we treat *any MCP
server that exposes a chat tool* as a **model provider**. If you can reach a
model — local Ollama, a vLLM cluster, llama.cpp, LiteLLM, OpenAI, OpenRouter,
a friend's GPU box, a hosted MCP endpoint — you can benchmark it, with the
full reliability pipeline wrapped around it: rate limiter, circuit breaker,
classified retries, context fitting, failover chains, token/cost telemetry.

```
┌─────────────┐  JSON-RPC 2.0  ┌──────────────────────┐   HTTP    ┌──────────────┐
│ WRYM arena  │ ─────────────▶ │ MCP server           │ ────────▶ │ ANY model    │
│ (MCP client)│  stdio or HTTP │ (e.g. llm-bridge)    │           │ endpoint     │
└─────────────┘                └──────────────────────┘           └──────────────┘
```

---

## 1. Quickstart — 60 seconds, zero code

You have an OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server,
LiteLLM, OpenAI, …). Bridge it:

```bash
# 1. point the bridge at your endpoint (here: local Ollama)
LLM_BASE_URL=http://localhost:11434/v1 \
LLM_MODEL=qwen2.5:14b \
node mcp/llm-bridge.mjs
```

Then in the **Admin Dashboard → Providers → Add provider**:

| field         | value                                            |
| ------------- | ------------------------------------------------ |
| kind          | `MCP server (any model)`                         |
| name          | `Qwen 2.5 14B (local)`                           |
| baseUrl       | `stdio:node mcp/llm-bridge.mjs`                  |
| API key       | `LLM_BASE_URL=http://localhost:11434/v1;LLM_MODEL=qwen2.5:14b` |
| model id      | `qwen2.5:14b`                                    |
| role          | thinker                                          |
| contextWindow | `8192` (set to what the model actually loads)    |

Save → **Test** → the arena spawns the bridge, handshakes, discovers the
`chat` tool, and the model is now a benchmark entrant. That's the whole
integration.

---

## 2. Configuration reference

An MCP provider is a normal Provider row (`kind = "mcp"`). Three columns
carry the transport config:

### `baseUrl` — the transport spec

| form | meaning |
| --- | --- |
| `stdio:<command + args>` | WRYM **spawns** the server as a child process and speaks newline-delimited JSON-RPC over its stdin/stdout. Example: `stdio:npx -y some-mcp-llm-server` |
| `https://host/mcp` | WRYM talks **streamable HTTP** (JSON-RPC POST; plain-JSON or SSE responses both accepted). Example: a hosted MCP gateway. |
| `…#tool=NAME` | optional fragment that **pins** the tool to call. Without it the client auto-discovers (see §4). Example: `stdio:node mcp/llm-bridge.mjs#tool=chat` |

### `apiKey` — credentials, per transport

| transport | meaning |
| --- | --- |
| `stdio:` | semicolon-separated env pairs exported to the child process: `LLM_BASE_URL=http://…;LLM_API_KEY=sk-…;LLM_MODEL=id` |
| `http(s)://` | sent as `Authorization: Bearer <apiKey>` |

### `modelId`

Forwarded to the tool as the `model` argument. Servers may ignore it (the
bridge uses it to pick the upstream model). All resilience knobs
(`contextWindow`, `rpm`, `tpm`, `concurrency`, `timeoutMs`, `maxRetries`,
`retryBaseMs`, `costPerMtok`, `priority`, `fallbackId`) work exactly as for
any other provider — see the Admin Dashboard.

---

## 3. The tool contract

WRYM calls the discovered tool with:

```json
{
  "system": "You are WYRM-SOLVER …",
  "messages": [
    { "role": "user", "content": "MISSION: … CURRENT BOARD: …" },
    { "role": "assistant", "content": "{…}" }
  ],
  "model": "qwen2.5:14b",
  "temperature": 0.4,
  "max_tokens": 1024
}
```

The tool must answer with MCP `tools/call` result content:

```json
{
  "content": [{ "type": "text", "text": "{\"thought\":\"…\",\"action\":\"right\"}" }],
  "structuredContent": { "text": "…", "thinking": "optional reasoning trace" }
}
```

- Plain `content[].text` is enough — joined text parts become the reply.
- `structuredContent` (or a single text part that parses as
  `{text, thinking}` / `{content, reasoning}`) lets the server surface a
  **reasoning trace**, which the arena records and streams like any other
  model's thinking.
- `isError: true` is mapped to a classified failure and enters the normal
  retry/failover machinery.

---

## 4. Tool discovery

1. If `#tool=NAME` is pinned → that tool must exist (hard error otherwise).
2. Otherwise the client scores tool names: exact `chat` / `llm_chat` /
   `wyrm_chat` → best; names matching
   `/chat|complete|infer|generat|llm|ask|respond|convers|query/` → good;
   anything else → last resort (first tool wins).
3. A server exposing **no tools** is a configuration error — reported as such.

---

## 5. Bringing your own MCP server

Any spec-compliant server works — Python (FastMCP), TypeScript (SDK), Rust,
whatever. Minimal Python example:

```python
# my_model_mcp.py — run with: stdio:python my_model_mcp.py (needs `mcp` package)
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-model")

@mcp.tool()
def chat(system: str = "", messages: list = [], model: str = "", temperature: float = 0.4, max_tokens: int = 1024) -> str:
    """Send a conversation to my model, get its reply."""
    return my_model_generate(system, messages, temperature, max_tokens)  # your code

mcp.run()  # stdio transport by default
```

Point the Provider at it: `baseUrl = stdio:python my_model_mcp.py`,
`apiKey = MY_MODEL_PATH=/weights/qwen …` (env pairs are exported to the child).

If your server is remote, run it behind streamable HTTP and use the
`https://…/mcp` form. Both transports speak the same JSON-RPC methods:
`initialize` → `notifications/initialized` → `tools/list` → `tools/call`.

---

## 6. Benchmark headless entry

For `bench/models.json` (used by `bun scripts/run-benchmark.ts`), an MCP
entrant looks like any other model:

```json
{
  "key": "qwen25-14b-mcp",
  "name": "Qwen 2.5 14B (MCP/Ollama)",
  "kind": "mcp",
  "modelId": "qwen2.5:14b",
  "baseUrl": "stdio:node mcp/llm-bridge.mjs",
  "apiKeyEnv": "WRYM_MCP_QWEN_ENV",
  "contextWindow": 8192,
  "concurrency": 1,
  "enabled": true
}
```

`apiKeyEnv` names an environment variable whose value is the env-pairs
string (`LLM_BASE_URL=…;LLM_API_KEY=…`) — keys never live in the file.

---

## 7. Reference bridge — `mcp/llm-bridge.mjs`

A zero-dependency Node ≥18 script (no install, no build):

| env | meaning |
| --- | --- |
| `LLM_BASE_URL` | endpoint root serving `POST /chat/completions` (required) |
| `LLM_API_KEY` | `Authorization: Bearer …` (optional for local servers) |
| `LLM_MODEL` | default model id (the client's `model` arg wins) |
| `LLM_TIMEOUT_MS` | upstream timeout (default 120000) |

It exposes one tool (`chat`), returns `structuredContent` with
`reasoning_content` mapped to `thinking`, and logs to **stderr only**
(stdout is the protocol channel).

Test the whole chain without any real model:

```bash
bun scripts/test-mcp.ts
```

---

## 8. Behaviour & guarantees

- **Lifecycle** — one server process per Provider row, spawned lazily on the
  first call, kept alive, shared across runs. A crashed server is reported
  with its stderr tail and respawned on the next call.
- **Timeouts** — `initialize`/`tools/list` get 20 s; every `tools/call` gets
  the provider's `timeoutMs` (default 120 s). Operator INTERRUPT aborts an
  in-flight tool call mid-generation.
- **Isolation** — the child inherits your env **plus** the pairs you put in
  `apiKey`; nothing else is injected. Server stderr never reaches the model
  or the observations.
- **Failover** — MCP failures are classified like any provider error
  (`server` / `network` / `timeout` / `invalid` …), so retry budgets and
  fallback chains (`fallbackId`) apply unchanged.
- **Secrets** — env pairs are stored server-side only, masked in the admin
  UI, never logged.

## 9. Troubleshooting

| symptom | cause → fix |
| --- | --- |
| `MCP server failed to start: ENOENT` | the command after `stdio:` isn't on PATH → use an absolute path |
| `MCP server exited (code=…)` with stderr tail | the server crashed on boot → run it manually in a shell first |
| `exposes no tools` | server has no chat-ish tool → pin one with `#tool=NAME` |
| `MCP error -32601` | server doesn't implement `tools/call` (too old / not a model server) |
| replies are empty | tool returns non-text content → check the tool returns `{type:"text"}` parts |
| hangs on initialize | server speaks SSE-only HTTP on an old transport → use the stdio bridge instead |
