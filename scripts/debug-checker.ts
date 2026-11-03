// Debug: replay the BFS run on Neon Severance and find the divergence
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const run = await db.run.findFirst({
    where: { model: { key: "wyrm-bfs" }, level: { name: "Neon Severance" } },
    include: { steps: { orderBy: { turn: "asc" } }, level: true },
  });
  if (!run) {
    console.log("run not found");
    return;
  }
  console.log("level grid:\n" + run.level.grid + "\n");

  // dynamic import of engine (TS via bun)
  const { createGame, step, serializeState } = await import("../src/lib/wyrm/engine");
  const level = { name: run.level.name, slug: run.level.slug, grid: run.level.grid.split("\n") };

  let state = createGame(level);
  console.log("initial serialize check vs step 0:");
  const steps = run.steps;
  for (let i = 0; i < steps.length; i++) {
    const rec = steps[i];
    const r = step(state, rec.action);
    if (!r.valid) {
      console.log(`step ${i + 1}: INVALID ${rec.action}: ${r.reason}`);
      continue;
    }
    state = r.state;
    const mine = serializeState(state);
    const theirs = rec.stateJson;
    const norm = (j: string) => {
      const d = JSON.parse(j);
      const sk = (p: any) => `${p.x},${p.y}`;
      return JSON.stringify({
        t: d.t,
        c: (d.c ?? []).map(sk).sort(),
        a: (d.a ?? []).map(sk).sort(),
        r: (d.r ?? []).map(sk).sort(),
        m: d.m,
        n: d.n,
        s: d.s,
      });
    };
    const match = norm(mine) === norm(theirs);
    if (!match) {
      console.log(`step ${i + 1} DIVERGES (action ${rec.action})`);
      console.log("engine board:\n" + mine.split('"t":["')[1]?.split('"]')[0].replace(/","/g, "\n"));
      console.log("recorded board:\n" + theirs.split('"t":["')[1]?.split('"]')[0].replace(/","/g, "\n"));
      console.log("recorded events:", rec.events);
      break;
    }
  }
  console.log("replay final status:", state.status, "| claimed:", run.status);
}

main().finally(() => db.$disconnect());
