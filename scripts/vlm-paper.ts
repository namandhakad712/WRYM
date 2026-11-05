// Visual QA for the whitepaper pages + site screenshots via vision model.
// Run: bun scripts/vlm-paper.ts <image...>
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
              text: `You are a strict reviewer of academic/research PDFs. This is a page of a whitepaper for an LLM game benchmark. Evaluate strictly: (1) Does it look like a professional research paper (clean typography, clear hierarchy, proper tables, justified text)? (2) Any overlapping text, overflowing tables, orphan headings, broken layout, or unreadable content? (3) Any rendering artifacts? Answer in under 100 words: VERDICT (PASS/NEEDS-FIX) + specific issues with locations.`,
            },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: "disabled" },
      max_tokens: 400,
    });
    console.log(`\n═══ ${f.split("/").pop()} ═══`);
    console.log((res?.choices?.[0]?.message?.content ?? "(no reply)").trim());
  } catch (e) {
    console.log(`\n═══ ${f.split("/").pop()} ═══\n  VLM error: ${(e as Error).message}`);
  }
}
