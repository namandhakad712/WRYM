// ── WYRM.LAB · rating system v2 ──────────────────────────────────────
// Pooled Bradley-Terry MLE with bootstrap confidence intervals — the
// estimator used by Chatbot Arena / LMArena and Kaggle Game Arena —
// replacing the old order-dependent online Elo (K=32).
//
// Why: online Elo depends on the order battles are applied in and gives
// no uncertainty. Pooled BT fits every battle at once (order-free,
// reproducible) and bootstrap resampling puts an honest ±95% CI on every
// rating, so "is A actually better than B?" becomes answerable.
//
// Draw handling follows the arena convention: a draw credits each side
// half a win (Davidson tie correction is unnecessary at our battle
// volumes).

export interface EloPlayer {
  elo: number;
}

// ── legacy online Elo (kept for the live in-app board; the archive and
//    the static site use the pooled estimator below) ─────────────────
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

// ── battles ──────────────────────────────────────────────────────────
export interface Battle {
  /** model key of side A */
  a: string;
  /** model key of side B */
  b: string;
  /** score of A in {0, 0.5, 1}; B gets 1 - sa */
  sa: number;
  /** level slug the battle was fought on */
  level: string;
}

export interface BattleRun {
  model: string;
  levelSlug: string;
  status: string;
  score: number;
}

/** Battle outcome between two runs of the SAME level (arena rules):
 *  a solved run beats an unsolved one; two solved runs are separated by
 *  score (efficiency-weighted); two failures draw. */
export function battleScoreOf(ra: BattleRun, rb: BattleRun): number {
  const aWon = ra.status === "won";
  const bWon = rb.status === "won";
  if (aWon && !bWon) return 1;
  if (!aWon && bWon) return 0;
  if (aWon && bWon) return ra.score >= rb.score ? 1 : 0;
  return 0.5;
}

/** All-pairs battles on shared levels (order-free input). */
export function battlesFromRuns(runs: BattleRun[]): Battle[] {
  const byLevel = new Map<string, BattleRun[]>();
  for (const r of runs) {
    const arr = byLevel.get(r.levelSlug) ?? [];
    arr.push(r);
    byLevel.set(r.levelSlug, arr);
  }
  const battles: Battle[] = [];
  for (const [level, rs] of byLevel) {
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        if (rs[i].model === rs[j].model) continue;
        battles.push({
          a: rs[i].model,
          b: rs[j].model,
          sa: battleScoreOf(rs[i], rs[j]),
          level,
        });
      }
    }
  }
  return battles;
}

// ── Bradley-Terry MLE (MM / minorization-maximization) ───────────────
// γ_i ← W_i / Σ_{j≠i} n_ij / (γ_i + γ_j), wins include half-draws;
// ratings are Elo-scaled (400·log10) around the geometric mean, anchored
// to 1200. Converges in a few dozen iterations at our volumes.
//
// `prior` adds pseudo-draws against a phantom field anchor (default 1):
// weak shrinkage that keeps ratings finite and CIs honest at low battle
// counts — with a single 1-0 battle an unregularized MLE diverges.

export function bradleyTerry(battles: Battle[], opts: { prior?: number } = {}): Record<string, number> {
  const prior = opts.prior ?? 1;
  const players = new Set<string>();
  for (const bt of battles) {
    players.add(bt.a);
    players.add(bt.b);
  }
  if (players.size < 2 || battles.length === 0) return {};

  const idx = new Map([...players].map((p, i) => [p, i]));
  const n = players.size;
  const ANCHOR = n; // phantom field-anchor index (regularization)
  const size = n + 1;
  const wins = new Float64Array(size); // W_i, draws = 0.5
  const pair = new Map<number, number>(); // i*size+j → battle count
  for (const bt of battles) {
    const i = idx.get(bt.a)!;
    const j = idx.get(bt.b)!;
    wins[i] += bt.sa;
    wins[j] += 1 - bt.sa;
    const k = Math.min(i, j) * size + Math.max(i, j);
    pair.set(k, (pair.get(k) ?? 0) + 1);
  }
  if (prior > 0) {
    // every real player gets `prior` pseudo-draws vs the anchor
    for (let i = 0; i < n; i++) {
      wins[i] += 0.5 * prior;
      wins[ANCHOR] += 0.5 * prior;
      const k = Math.min(i, ANCHOR) * size + Math.max(i, ANCHOR);
      pair.set(k, (pair.get(k) ?? 0) + prior);
    }
  }

  // MM iteration
  let gamma = new Float64Array(size).fill(1);
  for (let iter = 0; iter < 256; iter++) {
    const next = new Float64Array(size);
    let delta = 0;
    for (let i = 0; i < size; i++) {
      let denom = 0;
      for (let j = 0; j < size; j++) {
        if (i === j) continue;
        const k = Math.min(i, j) * size + Math.max(i, j);
        const nij = pair.get(k) ?? 0;
        if (nij > 0) denom += nij / (gamma[i] + gamma[j]);
      }
      // undefeated/winless guards: keep gamma strictly positive & finite
      const w = Math.max(wins[i], 1e-3);
      next[i] = denom > 0 ? w / denom : gamma[i];
      next[i] = Math.min(Math.max(next[i], 1e-6), 1e6);
      delta = Math.max(delta, Math.abs(next[i] - gamma[i]));
    }
    gamma = next;
    if (delta < 1e-10) break;
  }

  // Elo scale around the geometric mean of the REAL players, anchored at 1200
  let logSum = 0;
  for (let i = 0; i < n; i++) logSum += Math.log10(gamma[i]);
  const gm = logSum / n;
  const out: Record<string, number> = {};
  for (const [p, i] of idx) out[p] = Math.round(1200 + 400 * (Math.log10(gamma[i]) - gm));
  return out;
}

// ── deterministic bootstrap ──────────────────────────────────────────
/** mulberry32 — tiny seeded PRNG so every export is byte-reproducible. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CI {
  lo: number;
  hi: number;
}

/** Bootstrap 95% percentile CI for every player's BT rating. */
export function bootstrapCI(
  battles: Battle[],
  opts: { rounds?: number; seed?: number; prior?: number } = {},
): Record<string, CI> {
  const rounds = opts.rounds ?? 400;
  const prior = opts.prior ?? 1;
  const rnd = mulberry32(opts.seed ?? 0x572e);
  const players = new Set<string>();
  for (const bt of battles) {
    players.add(bt.a);
    players.add(bt.b);
  }
  const out: Record<string, CI> = {};
  if (players.size < 2 || battles.length === 0) return out;

  const samples: Record<string, number[]> = {};
  for (const p of players) samples[p] = [];
  for (let r = 0; r < rounds; r++) {
    const resample: Battle[] = new Array(battles.length);
    for (let i = 0; i < battles.length; i++) resample[i] = battles[(rnd() * battles.length) | 0];
    const ratings = bradleyTerry(resample, { prior });
    for (const [p, rating] of Object.entries(ratings)) samples[p].push(rating);
  }
  for (const [p, xs] of Object.entries(samples)) {
    xs.sort((x, y) => x - y);
    const lo = xs[Math.floor(0.025 * xs.length)];
    const hi = xs[Math.ceil(0.975 * xs.length) - 1];
    out[p] = { lo: Math.round(lo), hi: Math.round(hi) };
  }
  return out;
}

// ── head-to-head records ─────────────────────────────────────────────
export interface H2H {
  a: string;
  b: string;
  /** wins for a */
  w: number;
  /** draws */
  d: number;
  /** wins for b */
  l: number;
}

export function headToHead(battles: Battle[]): H2H[] {
  const acc = new Map<string, H2H>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const bt of battles) {
    const k = key(bt.a, bt.b);
    const rec =
      acc.get(k) ?? { a: bt.a < bt.b ? bt.a : bt.b, b: bt.a < bt.b ? bt.b : bt.a, w: 0, d: 0, l: 0 };
    // orient the battle onto (rec.a, rec.b)
    const sa = bt.a === rec.a ? bt.sa : 1 - bt.sa;
    if (sa === 1) rec.w++;
    else if (sa === 0) rec.l++;
    else rec.d++;
    acc.set(k, rec);
  }
  return [...acc.values()].sort((x, y) => y.w + y.l - (x.w + x.l));
}
