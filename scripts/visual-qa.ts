// Visual QA of the dashboard screenshots via VLM
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync } from "fs";

const shots = [
  { path: "/tmp/render/01-overview.png", what: "the Overview/command-center page of a dark-themed dashboard called WYRM.LAB" },
  { path: "/tmp/render/02-playdetail.png", what: "a play detail view with a rendered SVG grid game board on the left and an ASCII board + thought log on the right" },
  { path: "/tmp/render/03-playdetail-frame3.png", what: "the same play detail view, advanced a few frames" },
  { path: "/tmp/render/04-loop.png", what: "the agentic loop view showing cycle cards" },
];

async function main() {
  const zai = await ZAI.create();
  for (const s of shots) {
    const b64 = readFileSync(s.path).toString("base64");
    const res: any = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a strict UI QA reviewer. This screenshot should show ${s.what}. Answer in JSON: {"renders": true/false, "issues": ["..."], "highlights": ["..."]}. "renders" means the page is visually complete (no blank areas, no broken layout, no placeholder text, no error screens). issues = concrete visual problems if any. highlights = what looks good. Be specific and brief.`,
            },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
      model: "glm-4.6v",
      thinking: { type: "disabled" },
    });
    console.log(`\n═══ ${s.path} ═══`);
    console.log(res?.choices?.[0]?.message?.content ?? "NO RESPONSE");
  }
}

main().catch((e) => {
  console.error("VLM check failed:", e.message);
  process.exit(1);
});
