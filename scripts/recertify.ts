// Re-run the Checker on every stored run and refresh verdicts
// (maintenance utility — proves determinism + repairs stale verdicts)
import { PrismaClient } from "@prisma/client";
import { checkRun } from "../src/lib/wyrm/agents/checker";
import type { LevelDef } from "../src/lib/wyrm/types";

const db = new PrismaClient();

async function main() {
  const runs = await db.run.findMany({
    include: { steps: { orderBy: [{ turn: "asc" }, { id: "asc" }] }, level: true },
  });
  for (const run of runs) {
    const level: LevelDef = {
      name: run.level.name,
      slug: run.level.slug,
      grid: run.level.grid.split("\n"),
    };
    const verdict = checkRun(level, {
      steps: run.steps.map((s) => ({
        action: s.action,
        valid: s.valid,
        attempt: s.attempt,
        stateJson: s.stateJson,
        events: s.events,
      })),
      claimedStatus: run.status,
    });
    const changed = verdict.verdict !== run.checkerVerdict;
    await db.run.update({
      where: { id: run.id },
      data: { checkerVerdict: verdict.verdict, checkerJson: JSON.stringify(verdict) },
    });
    console.log(
      `${changed ? "↻ updated" : "  same  "} ${run.status.padEnd(9)} ${run.level.name.padEnd(20)} → ${verdict.verdict}${verdict.reasons.length ? ` (${verdict.reasons[0].slice(0, 80)})` : ""}`,
    );
  }
}

main().finally(() => db.$disconnect());
