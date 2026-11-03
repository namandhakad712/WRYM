// Visual QA via vision model: critique each captured screenshot.
// Run: bun scripts/vlm-qa.ts
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync("/tmp/qa").filter((f) => f.endsWith(".png")).sort().map((f) => `/tmp/qa/${f}`);

const zai = await ZAI.create();

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const b64 = fs.readFileSync(f).toString("base64");
  try {
    const res: any = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a strict UI/UX design reviewer. This is a screenshot of a professional "laboratory paper" themed dashboard (warm paper background, ink text, wax-red accent, editorial style). Evaluate: (1) Does it look like a polished, professional, premium light paper/ink aesthetic — or does anything look cheap, broken, washed out, or dark-theme leftover? (2) Any broken layout, unreadable text (low contrast), overlapping elements, empty areas, or unstyled components? (3) Is the game board (if present) rendered as an elegant ink-on-parchment illustration? Answer in under 120 words as a bullet list: VERDICT (PASS/NEEDS-FIX) + specific issues with locations.`,
            },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: "disabled" },
      max_tokens: 500,
    });
    const text = res?.choices?.[0]?.message?.content ?? "(no reply)";
    console.log(`\n═══ ${f.split("/").pop()} ═══`);
    console.log(text.trim());
  } catch (e) {
    console.log(`\n═══ ${f.split("/").pop()} ═══\n  VLM error: ${(e as Error).message}`);
  }
}
