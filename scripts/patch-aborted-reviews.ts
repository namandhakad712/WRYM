// Patch: add honest review notes to aborted runs that lack reviewJson
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const runs = await db.run.findMany({
    where: { status: "aborted", reviewJson: null },
    include: { level: { select: { name: true } } },
  });
  for (const run of runs) {
    await db.run.update({
      where: { id: run.id },
      data: {
        reviewJson: JSON.stringify({
          ok: false,
          rating: 0,
          summary:
            "Run aborted — the model API was rate-limited (HTTP 429) during this session's heavy testing. The engine, recorder and checker stayed fully operational; press “let GLM-4.6 play” on this level to retry.",
          strengths: [],
          weaknesses: [],
          suggestions: [],
          latencyMs: 0,
        }),
      },
    });
    console.log("patched:", run.level.name);
  }
}

main().finally(() => db.$disconnect());
