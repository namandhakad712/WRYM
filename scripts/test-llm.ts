import { chat } from "../src/lib/wyrm/agents/llm";
async function main() {
  const r = await chat([{ role: "user", content: 'Reply with exactly: {"thought":"test","action":"up"}' }], { retries: 1 });
  console.log("ok:", r.ok, "| latency:", r.latencyMs, "ms");
  console.log("text:", r.text.slice(0, 200));
  if (r.error) console.log("error:", r.error);
}
main();
