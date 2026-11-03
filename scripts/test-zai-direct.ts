import ZAI from "z-ai-web-dev-sdk";
async function main() {
  const zai = await ZAI.create();
  try {
    const res: any = await zai.chat.completions.create({
      model: "glm-4.6",
      messages: [{ role: "user", content: "reply with OK" }],
      thinking: { type: "disabled" },
      max_tokens: 10,
    });
    console.log("GLM OK:", res?.choices?.[0]?.message?.content?.slice(0, 50));
  } catch (e) {
    console.log("GLM still limited:", (e as Error).message.slice(0, 100));
  }
}
main();
