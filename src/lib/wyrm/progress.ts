// ── WYRM.LAB · fine-grained progress score ───────────────────────────
// Lesson from BALROG (Paglieri et al., arXiv:2411.13543): binary
// win/loss hides how far an agent actually got. Their fine-grained metric
// captures proximity to task completion; we do the same from the run
// archive itself, so even a failed run carries a number:
//
//   progress = 60 × apples-eaten fraction
//            + 25 × goal reached (binary)
//            + 15 × distance closure (initial head→heart Manhattan
//                   distance vs final, clamped to [0,1])
//
// The apple term dominates because apples are the prerequisite chain of
// every level; the closure term credits navigation toward the heart on
// runs that died hungry. 0-100, deterministic, no engine re-run needed.

interface ProgressRun {
  result: { status: string; applesEaten: number };
  level: { grid?: string[] };
  steps?: Array<{ stateJson?: string }>;
}

export function progressOfRun(run: ProgressRun): number {
  const grid = run.level.grid ?? [];
  const all = grid.join("");
  const applesTotal = (all.match(/\*/g) || []).length;

  const appleFrac = applesTotal > 0 ? Math.min(1, run.result.applesEaten / applesTotal) : 1;
  const won = run.result.status === "won" ? 1 : 0;

  // distance closure from the recorded states (no engine replay)
  let closure = 0;
  try {
    const findHeart = () => {
      for (let y = 0; y < grid.length; y++) {
        const x = grid[y].indexOf("X");
        if (x >= 0) return { x, y };
      }
      return null;
    };
    const heart = findHeart();
    const headOf = (stateJson?: string): { x: number; y: number } | null => {
      if (!stateJson) return null;
      const st = JSON.parse(stateJson);
      return st.m && st.m[0] ? st.m[0] : null;
    };
    const first = headOf(run.steps?.[0]?.stateJson);
    const last =
      headOf(run.steps?.[run.steps.length - 1]?.stateJson) ?? first;
    if (heart && first && last) {
      const d0 = Math.abs(first.x - heart.x) + Math.abs(first.y - heart.y);
      const dF = Math.abs(last.x - heart.x) + Math.abs(last.y - heart.y);
      if (d0 > 0) closure = Math.max(0, Math.min(1, 1 - dF / d0));
      else closure = 1;
    }
  } catch {
    /* malformed/absent states — closure stays 0; the run still gets
       apple credit */
  }

  return Math.round(60 * appleFrac + 25 * won + 15 * closure);
}
