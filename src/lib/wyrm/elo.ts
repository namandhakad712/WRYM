// ── WYRM.LAB · Elo rating ────────────────────────────────────────────
// Standard Elo with K=32, applied pairwise between models that played
// the same level. Winner = solved with fewer moves; a solved run always
// beats an unsolved one.

export interface EloPlayer {
  elo: number;
}

export function eloUpdate(
  a: { elo: number; score: number; solved: boolean },
  b: { elo: number; score: number; solved: boolean },
): { newA: number; newB: number; expectedA: number } {
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
  const sA = a.solved && !b.solved ? 1 : !a.solved && b.solved ? 0 : a.solved && b.solved ? (a.score >= b.score ? 1 : 0) : 0.5;
  const sB = 1 - sA;
  return {
    newA: Math.round(a.elo + K * (sA - expectedA)),
    newB: Math.round(b.elo + K * (sB - (1 - expectedA))),
    expectedA,
  };
}

/** Run score: solved runs get 1000 - 10×moves - 100×deaths (floor 100). */
export function computeScore(movesUsed: number, solved: boolean, deaths: number): number {
  if (!solved) return 0;
  return Math.max(100, 1000 - movesUsed * 10 - deaths * 100);
}
