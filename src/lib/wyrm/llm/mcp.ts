// ── WYRM.LAB · MCP client — add ANY model via Model Context Protocol ──
// A Provider row with kind="mcp" turns the arena into an MCP CLIENT.
// Whatever model you can reach through an MCP server — a local Ollama
// bridge, a vLLM gateway, a friend's GPU box, a hosted MCP endpoint —
// becomes a first-class benchmark entrant, with the full reliability
// pipeline (rate limiter, circuit breaker, retries, failover chain)
// wrapped around it.
//
// CONFIG (maps onto the existing Provider columns — no migration):
//   baseUrl  transport spec:
//              stdio:  "stdio:npx -y wyrm-llm-bridge"
//                      "stdio:bun mcp/llm-bridge.mjs"
//              http:   "https://host/mcp"      (streamable HTTP, JSON-RPC POST)
//            optional "#tool=NAME" fragment pins the tool to call;
//            without it the client auto-discovers the chat tool.
//   apiKey   stdio → "KEY=value;KEY2=value" exported as env for the child
//            http  → bearer token (Authorization: Bearer …)
//   modelId  forwarded as the "model" argument (servers may ignore it)
//
// PROTOCOL (JSON-RPC 2.0, MCP spec 2025-06-18):
//   → initialize { protocolVersion, capabilities, clientInfo }
//   ← result { serverInfo, capabilities }
//   → notifications/initialized
//   → tools/list  → tools/call { name, arguments }
//   ← result { content: [{ type:"text", text }], isError? }
//
// The tool receives:
//   { system, messages: [{role, content}], model, temperature, max_tokens }
// and returns text (or JSON { text, thinking } — thinking is captured
// into the reasoning stream). Full contract: docs/MCP_SUPPORT.md.

import { spawn, type ChildProcess } from "node:child_process";
import { LLMApiError } from "./resilience";
import type { ChatMsg, LLMTarget } from "./types";

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "WRYM-arena", version: "3.0.0" };
const INIT_TIMEOUT_MS = 20_000;

// ── transport spec parsing ────────────────────────────────────────────

export interface McpSpec {
  transport: "stdio" | "http";
  command?: string; // stdio: executable
  args?: string[]; // stdio: argv
  url?: string; // http: endpoint
  env: Record<string, string>; // stdio: extra env for the child
  bearer?: string; // http: Authorization bearer
  tool?: string; // pinned tool name ("#tool=…" fragment)
}

export function parseMcpSpec(target: LLMTarget): McpSpec {
  let raw = (target.baseUrl ?? "").trim();
  if (!raw) {
    throw new LLMApiError(
      "MCP provider needs a baseUrl: 'stdio:<command>' or an https://…/mcp URL (see docs/MCP_SUPPORT.md)",
      400,
      "missing baseUrl",
    );
  }
  let tool: string | undefined;
  const hash = raw.indexOf("#");
  if (hash >= 0) {
    const frag = raw.slice(hash + 1);
    if (frag.startsWith("tool=")) tool = frag.slice(5).trim() || undefined;
    raw = raw.slice(0, hash);
  }
  if (raw.toLowerCase().startsWith("stdio:")) {
    const cmdline = raw.slice(6).trim();
    const parts = cmdline.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((s) => s.replace(/^["']|["']$/g, "")) ?? [];
    if (!parts.length) throw new LLMApiError("stdio: transport needs a command after the prefix", 400, raw);
    const env: Record<string, string> = {};
    // apiKey doubles as the child's env block: "KEY=value;KEY2=value"
    for (const pair of (target.apiKey ?? "").split(";")) {
      const eq = pair.indexOf("=");
      if (eq > 0) env[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    return { transport: "stdio", command: parts[0], args: parts.slice(1), env, tool };
  }
  if (/^https?:\/\//i.test(raw)) {
    return { transport: "http", url: raw, env: {}, bearer: target.apiKey || undefined, tool };
  }
  throw new LLMApiError(
    `unrecognised MCP transport "${raw.slice(0, 60)}" — use stdio:<command> or http(s)://…/mcp`,
    400,
    raw,
  );
}

// ── stdio transport (newline-delimited JSON-RPC) ──────────────────────

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

class StdioTransport {
  private proc: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";
  stderrTail = "";
  dead = false;

  constructor(
    private spec: McpSpec,
    private signal?: AbortSignal,
  ) {
    this.proc = spawn(spec.command!, spec.args ?? [], {
      env: { ...process.env, ...spec.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout!.on("data", (c: Buffer) => this.feed(c));
    this.proc.stderr!.on("data", (c: Buffer) => {
      this.stderrTail = (this.stderrTail + c.toString()).slice(-2000);
    });
    this.proc.on("error", (e: Error) => this.failAll(new LLMApiError(`MCP server failed to start: ${e.message}`, 400, e.message)));
    this.proc.on("exit", (code, sig) => {
      this.dead = true;
      this.failAll(
        new LLMApiError(
          `MCP server exited (code=${code} signal=${sig})${this.stderrTail ? ` — stderr: ${this.stderrTail.slice(-400)}` : ""}`,
          502,
          this.stderrTail,
        ),
      );
    });
    signal?.addEventListener("abort", () => this.failAll(new DOMException("aborted", "AbortError")), { once: true });
  }

  private feed(chunk: Buffer) {
    this.buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // keep-alive noise / banner text
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) {
          p.reject(new LLMApiError(`MCP error ${msg.error.code}: ${msg.error.message}`, 502, JSON.stringify(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      }
      // notifications (logging etc.) are ignored
    }
  }

  private failAll(e: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<any> {
    if (this.dead) return Promise.reject(new LLMApiError("MCP server process is gone", 502, "dead"));
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LLMApiError(`MCP ${method} timed out after ${timeoutMs}ms`, 504, "timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin!.write(body, (e) => {
        if (e) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new LLMApiError(`MCP stdin write failed: ${e.message}`, 502, e.message));
        }
      });
    });
  }

  notify(method: string, params: unknown) {
    if (this.dead) return;
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  kill() {
    this.dead = true;
    try {
      this.proc.kill();
    } catch {
      /* already gone */
    }
  }
}

// ── streamable HTTP transport (JSON-RPC POST) ─────────────────────────

class HttpTransport {
  constructor(
    private spec: McpSpec,
    private signal?: AbortSignal,
  ) {}

  async request(method: string, params: unknown, timeoutMs: number): Promise<any> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onOuter = () => ctl.abort();
    this.signal?.addEventListener("abort", onOuter, { once: true });
    try {
      const res = await fetch(this.spec.url!, {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.spec.bearer ? { Authorization: `Bearer ${this.spec.bearer}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() % 1e9, method, params }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new LLMApiError(`MCP http ${res.status} ${body.slice(0, 200)}`, res.status, body);
      }
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("text/event-stream")) {
        // streamable HTTP may answer SSE-style: parse data: lines
        const text = await res.text();
        for (const line of text.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const msg = JSON.parse(data);
            if (msg.error) throw new LLMApiError(`MCP error ${msg.error.code}: ${msg.error.message}`, 502, data);
            return msg.result;
          } catch (e) {
            if (e instanceof LLMApiError) throw e;
          }
        }
        throw new LLMApiError("MCP http: no JSON-RPC payload in SSE stream", 502, "empty sse");
      }
      const msg = await res.json();
      if (msg.error) throw new LLMApiError(`MCP error ${msg.error.code}: ${msg.error.message}`, 502, JSON.stringify(msg.error));
      return msg.result;
    } catch (e) {
      if (ctl.signal.aborted && this.signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (e instanceof LLMApiError) throw e;
      throw new LLMApiError(`MCP http transport: ${(e as Error).message}`, 502, String(e));
    } finally {
      clearTimeout(timer);
      this.signal?.removeEventListener("abort", onOuter);
    }
  }

  async notify(_method: string, _params: unknown) {
    /* streamable HTTP notifications are fire-and-forget POSTs; the
       initialized notification is safe to skip for spec-compliant
       servers that tolerate it, and most do. */
  }
}

// ── session (initialize → tools/list → tools/call) ────────────────────

interface McpTool {
  name: string;
  description?: string;
}

const TOOL_SCORE = (name: string): number => {
  const n = name.toLowerCase();
  if (n === "chat" || n === "wyrm_chat" || n === "llm_chat") return 100;
  if (/chat|complete|completion|infer|generat|llm|ask|respond|convers|query/.test(n)) return 70;
  return 0;
};

export class McpSession {
  private transport: StdioTransport | HttpTransport;
  tools: McpTool[] = [];
  serverInfo: { name?: string; version?: string } = {};
  ready: Promise<void>;

  constructor(
    public key: string,
    spec: McpSpec,
    signal?: AbortSignal,
  ) {
    this.transport =
      spec.transport === "stdio" ? new StdioTransport(spec, signal) : new HttpTransport(spec, signal);
    this.ready = this.handshake();
  }

  private async handshake(): Promise<void> {
    const res = await this.transport.request(
      "initialize",
      { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      INIT_TIMEOUT_MS,
    );
    this.serverInfo = res?.serverInfo ?? {};
    this.transport.notify("initialized", {});
    const listed = await this.transport.request("tools/list", {}, INIT_TIMEOUT_MS);
    this.tools = listed?.tools ?? [];
  }

  /** Resolve the chat tool: pinned → exact/scored match → first tool. */
  pickTool(pinned?: string): string {
    if (pinned) {
      const exact = this.tools.find((t) => t.name === pinned);
      if (exact) return exact.name;
      throw new LLMApiError(
        `MCP server ${this.serverInfo.name ?? this.key} has no tool "${pinned}" (available: ${this.tools.map((t) => t.name).join(", ") || "none"})`,
        400,
        "tool not found",
      );
    }
    let best: McpTool | null = null;
    let bestScore = -1;
    for (const t of this.tools) {
      const s = TOOL_SCORE(t.name);
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    if (best) return best.name;
    if (this.tools.length) return this.tools[0].name;
    throw new LLMApiError(`MCP server ${this.serverInfo.name ?? this.key} exposes no tools`, 400, "no tools");
  }

  async callTool(name: string, args: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    // stdio: race the RPC against the caller's abort signal
    const rpc = this.transport.request("tools/call", { name, arguments: args }, timeoutMs);
    if (!signal) return rpc;
    return await Promise.race([
      rpc,
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }),
      ),
    ]);
  }

  kill() {
    if (this.transport instanceof StdioTransport) this.transport.kill();
  }
}

// ── session cache (one live server per provider) ──────────────────────

const sessions = new Map<string, McpSession>();

function specKey(target: LLMTarget, spec: McpSpec): string {
  return `${target.name}|${spec.transport}|${spec.command ?? ""}|${(spec.args ?? []).join(" ")}|${spec.url ?? ""}`;
}

async function getSession(target: LLMTarget, spec: McpSpec, signal?: AbortSignal): Promise<McpSession> {
  const key = specKey(target, spec);
  const existing = sessions.get(key);
  if (existing) {
    try {
      await existing.ready;
      return existing;
    } catch {
      existing.kill();
      sessions.delete(key);
    }
  }
  const session = new McpSession(key, spec, signal);
  sessions.set(key, session);
  try {
    await session.ready;
  } catch (e) {
    session.kill();
    sessions.delete(key);
    throw e;
  }
  return session;
}

/** Admin/health: list live MCP sessions (names + tool counts). */
export function mcpSessionInfo(): { key: string; server: string; tools: number }[] {
  return [...sessions.values()].map((s) => ({
    key: s.key,
    server: s.serverInfo.name ?? "?",
    tools: s.tools.length,
  }));
}

// ── tool result → { text, thinking } ──────────────────────────────────

export function extractToolText(result: any): { text: string; thinking: string } {
  if (!result || result.isError) {
    const detail = result?.isError
      ? contentText(result).slice(0, 300) || "tool reported an error"
      : "empty tool result";
    throw new LLMApiError(`MCP tool call failed: ${detail}`, 502, detail);
  }
  // preferred: structuredContent { text, thinking? }
  const sc = result.structuredContent;
  if (sc && typeof sc === "object") {
    const t = typeof sc.text === "string" ? sc.text : typeof sc.content === "string" ? sc.content : "";
    const th = typeof sc.thinking === "string" ? sc.thinking : typeof sc.reasoning === "string" ? sc.reasoning : "";
    if (t || th) return { text: t, thinking: th };
  }
  let text = contentText(result);
  // a single text part that is itself JSON {text|thinking|content|response}
  if (text.trimStart().startsWith("{")) {
    try {
      const j = JSON.parse(text);
      const t = typeof j.text === "string" ? j.text : typeof j.content === "string" ? j.content : typeof j.response === "string" ? j.response : "";
      const th = typeof j.thinking === "string" ? j.thinking : typeof j.reasoning === "string" ? j.reasoning : "";
      if (t || th) return { text: t, thinking: th };
    } catch {
      /* plain text that happens to start with { — keep as-is */
    }
  }
  return { text, thinking: "" };
}

function contentText(result: any): string {
  if (typeof result?.content === "string") return result.content;
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
  }
  if (typeof result?.text === "string") return result.text;
  return "";
}

// ── the chat entry point used by client.ts ────────────────────────────

export interface McpChatResult {
  ok: true;
  text: string;
  thinking: string;
  latencyMs: number;
  model: string;
  provider: string;
  mcp?: { server: string; tool: string; tools: number };
}

export async function mcpChat(
  target: LLMTarget,
  messages: ChatMsg[],
  opts: { signal?: AbortSignal; onDelta?: (d: { text?: string; thinking?: string }) => void },
  t0: number,
  timeoutMs: number,
): Promise<McpChatResult> {
  const spec = parseMcpSpec(target);
  const session = await getSession(target, spec, opts.signal);
  const tool = session.pickTool(spec.tool);

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const args: Record<string, unknown> = {
    system: system || undefined,
    messages: convo,
    ...(target.modelId ? { model: target.modelId } : {}),
    temperature: target.temperature,
    max_tokens: target.maxTokens,
  };

  const result = await session.callTool(tool, args, timeoutMs, opts.signal);
  const { text, thinking } = extractToolText(result);
  if (!text && !thinking) {
    throw new LLMApiError("MCP tool returned no text content", 502, "empty content");
  }
  // MCP tools answer atomically — surface the payload as one delta so the
  // control room still renders the model's mind live.
  if (text) opts.onDelta?.({ text });
  if (thinking) opts.onDelta?.({ thinking });

  return {
    ok: true,
    text,
    thinking,
    latencyMs: Date.now() - t0,
    model: target.modelId,
    provider: target.name,
    mcp: { server: session.serverInfo.name ?? "?", tool, tools: session.tools.length },
  };
}
