// Publish a dirt-mechanic level through the FORGE API and run the BFS solver on it
async function main() {
  const grid = [
    "##########",
    "#@++...*.#",
    "#.######.#",
    "#+.....#.#",
    "####.#.#.#",
    "#*...#.#.#",
    "#.##...#D#",
    "#%......X#",
    "##########",
  ];
  const r = await fetch("http://localhost:3000/api/levels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Deep Roots", grid }),
  });
  const j = await r.json();
  if (!r.ok) { console.log("publish failed:", j.error); return; }
  console.log("published:", j.level.name, "| difficulty:", j.level.difficulty, "| minMoves:", j.level.minMoves, "| dirt in report: check");

  const r2 = await fetch("http://localhost:3000/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ levelId: j.level.id, modelKey: "wyrm-bfs" }),
  });
  const j2 = await r2.json();
  console.log("solver run:", j2.runId);

  const detail = await (await fetch(`http://localhost:3000/api/runs/${j2.runId}`)).json();
  const run = detail.run;
  const digSteps = run.steps.filter((s: any) => (JSON.parse(s.events) || []).some((e: any) => e.type === "dig"));
  console.log("run status:", run.status, "| steps:", run.steps.length, "| dig events:", digSteps.length);
  console.log("checker:", run.checkerVerdict);
}
main();
