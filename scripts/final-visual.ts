import ZAI from "z-ai-web-dev-sdk";
import { readFileSync } from "fs";
async function main() {
  const zai = await ZAI.create();
  const b64 = readFileSync("/tmp/render/09-final-home.png").toString("base64");
  const res: any = await zai.chat.completions.createVision({
    messages: [{ role: "user", content: [
      { type: "text", text: 'Final QA screenshot of WYRM.LAB dashboard homepage. JSON only: {"renders": bool, "score": 1-10, "verdict": "one sentence"}' },
      { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
    ]}],
    model: "glm-4.6v",
    thinking: { type: "disabled" },
  });
  console.log(res?.choices?.[0]?.message?.content);
}
main().catch(e => { console.error("VLM unavailable:", e.message.slice(0, 100)); process.exit(0); });
