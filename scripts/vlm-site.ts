// Visual QA for the docs-site pages via vision model.
// Run: bun scripts/vlm-paper.ts (misnomer: works for any screenshot)
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

const files = process.argv.slice(2);
if (!files.length) { console.log("no images given"); process.exit(1); }
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
              text: `You are a strict UI/UX reviewer for an Awwwards-caliber game-benchmark documentation site (dark warm soil palette, coral accent, playful-but-premium "Level Forge" aesthetic, Fredoka display font). This is a FULL-PAGE screenshot. Check strictly: (1) broken layout, overlapping or clipped text, misaligned cards/tables; (2) unstyled/broken components (raw HTML look, missing CSS); (3) dead/empty sections or error messages; (4) navigation consistency; (5) does it look premium and professionally designed? Answer under 110 words: VERDICT (PASS/NEEDS-FIX) + specific issues with locations.`,
            },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: "disabled" },
      max_tokens: 420,
    });
    console.log(`\n═══ ${f.split("/").pop()} ═══`);
    console.log((res?.choices?.[0]?.message?.content ?? "(no reply)").trim());
  } catch (e) {
    console.log(`\n═══ ${f.split("/").pop()} ═══\n  VLM error: ${(e as Error).message}`);
  }
}
