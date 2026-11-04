// ── WRYM.LAB · MCP integration test ──────────────────────────────────
// Proves the full chain WITHOUT any external network:
//
//   mcpChat (our MCP client)
//     → stdio JSON-RPC → mcp/llm-bridge.mjs (reference MCP server)
//       → HTTP → local mock OpenAI-compatible endpoint
//
// Usage: bun scripts/test-mcp.ts
import { createServer } from "node:http";
import { mcpChat, parseMcpSpec } from "../src/lib/wyrm/llm/mcp";
import type { LLMTarget } from "../src/lib/wyrm/llm/types";

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
};

// ── 1. mock OpenAI-compatible upstream ───────────────────────────────
const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url?.includes("/chat/completions")) {
      res.writeHead(404).end("not found");
      return;
    }
    const auth = req.headers["authorization"] ?? "";
    const parsed = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        model: parsed.model,
        choices: [
          {
            message: {
              role: "assistant",
              content: auth === "Bearer sk-test-123" ? '{"thought":"mock plan","action":"right"}' : "UNAUTHORIZED",
              reasoning_content: "mock reasoning trace",
            },
          },
        ],
      }),
    );
  });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const port = (mock.address() as { port: number }).port;
console.log(`mock upstream on 127.0.0.1:${port}`);

const base: LLMTarget = {
  name: "mcp-test",
  kind: "mcp",
  baseUrl: `stdio:node mcp/llm-bridge.mjs`,
  apiKey: `LLM_BASE_URL=http://127.0.0.1:${port}/v1;LLM_API_KEY=sk-test-123;LLM_MODEL=mock-1`,
  modelId: "mock-1",
  temperature: 0.2,
  maxTokens: 256,
};

const convo = [
  { role: "system" as const, content: "You are a test solver." },
  { role: "user" as const, content: "BOARD:\n#*@#\nreply with JSON" },
];

// ── 2. spec parsing ──────────────────────────────────────────────────
console.log("\n[1] spec parsing");
const spec = parseMcpSpec(base);
ok("stdio transport detected", spec.transport === "stdio");
ok("command parsed", spec.command === "node" && (spec.args ?? []).join(" ") === "mcp/llm-bridge.mjs");
ok("env pairs parsed", spec.env.LLM_BASE_URL === `http://127.0.0.1:${port}/v1` && spec.env.LLM_API_KEY === "sk-test-123");

const pinned = parseMcpSpec({ ...base, baseUrl: `stdio:node mcp/llm-bridge.mjs#tool=chat` });
ok("#tool= fragment parsed", pinned.tool === "chat");
try {
  parseMcpSpec({ ...base, baseUrl: "ftp://nope" });
  ok("bad transport rejected", false);
} catch {
  ok("bad transport rejected", true);
}

// ── 3. full stdio round trip (auto-discovered tool) ──────────────────
console.log("\n[2] full chain: client → bridge → mock upstream");
try {
  const res = await mcpChat(base, convo, {}, Date.now(), 30_000);
  ok("call succeeded", res.ok);
  ok("auto-discovered tool is 'chat'", res.mcp?.tool === "chat", `got ${res.mcp?.tool}`);
  ok("server identified", res.mcp?.server === "wyrm-llm-bridge", `got ${res.mcp?.server}`);
  ok("text is the model reply", res.text === '{"thought":"mock plan","action":"right"}', res.text);
  ok("thinking captured from reasoning_content", res.thinking === "mock reasoning trace");
  ok("provider name propagated", res.provider === "mcp-test");
} catch (e) {
  ok("call succeeded", false, (e as Error).message);
}

// ── 4. pinned tool + second call reuses the live session ────────────
console.log("\n[3] pinned tool + session reuse");
try {
  const t0 = Date.now();
  const res = await mcpChat({ ...base, baseUrl: `stdio:node mcp/llm-bridge.mjs#tool=chat` }, convo, {}, Date.now(), 30_000);
  ok("pinned call succeeded", res.ok && res.mcp?.tool === "chat");
  ok(`session reused (fast: ${Date.now() - t0}ms)`, Date.now() - t0 < 5_000);
} catch (e) {
  ok("pinned call succeeded", false, (e as Error).message);
}

// ── 5. wrong tool pin fails cleanly ──────────────────────────────────
console.log("\n[4] clean failure on bad pin");
try {
  await mcpChat({ ...base, baseUrl: `stdio:node mcp/llm-bridge.mjs#tool=nope` }, convo, {}, Date.now(), 30_000);
  ok("bad pin rejected", false);
} catch (e) {
  ok("bad pin rejected", (e as Error).message.includes("no tool"));
}

// ── 6. HTTP transport against the mock directly (JSON-RPC POST) ─────
console.log("\n[5] streamable HTTP transport");
{
  // minimal MCP-over-HTTP mock
  const httpMcp = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const rpc = JSON.parse(body);
      if (rpc.method === "initialize") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { serverInfo: { name: "http-mock", version: "1" }, capabilities: {} } }));
      } else if (rpc.method === "tools/list") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: [{ name: "chat" }] } }));
      } else if (rpc.method === "tools/call") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { content: [{ type: "text", text: '{"thought":"http","action":"left"}' }] },
          }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: {} }));
      }
    });
  });
  await new Promise<void>((r) => httpMcp.listen(0, "127.0.0.1", r));
  const hp = (httpMcp.address() as { port: number }).port;
  try {
    const res = await mcpChat(
      { ...base, name: "mcp-http-test", baseUrl: `http://127.0.0.1:${hp}/mcp`, apiKey: "" },
      convo,
      {},
      Date.now(),
      15_000,
    );
    ok("http transport round trip", res.ok && res.text === '{"thought":"http","action":"left"}', res.text);
    ok("http server identified", res.mcp?.server === "http-mock");
  } catch (e) {
    ok("http transport round trip", false, (e as Error).message);
  }
  httpMcp.close();
}

mock.close();
console.log(`\n${failed === 0 ? `ALL ${passed} MCP CHECKS PASSED` : `${failed} CHECK(S) FAILED (${passed} passed)`}`);
process.exit(failed === 0 ? 0 : 1);
