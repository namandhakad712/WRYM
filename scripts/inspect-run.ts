import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const run = await db.run.findFirst({
    where: { model: { key: "glm-4.6" }, level: { name: "Rusty Gate" } },
    include: { steps: true },
  });
  if (!run) return console.log("not found");
  console.log("status:", run.status, "| steps:", run.steps.length);
  for (const s of run.steps.slice(0, 4)) {
    console.log("---");
    console.log("action:", s.action, "| valid:", s.valid, "| reason:", s.invalidReason);
    console.log("rawOutput:", (s.rawOutput ?? "").slice(0, 300));
  }
}
main().finally(() => db.$disconnect());
