// ── WYRM.LAB · capability taxonomy ───────────────────────────────────
// Lesson from SmartPlay (Wu et al., arXiv:2310.01557): a game benchmark
// is far more informative when each task declares WHICH agent capabilities
// it stresses, so per-model results decompose into a capability profile
// instead of one scalar.
//
// We adapt SmartPlay's capability axes to the worm's mechanics. Every
// capability is derived — transparently and deterministically — from the
// level's own geometry and certified statistics (no hand labels, no
// vibes). Intensities are 0-100 and feed the site's capability profiles.

export type CapabilityKey =
  | "spatial"
  | "planning"
  | "dependencies"
  | "state-tracking"
  | "long-horizon"
  | "risk"
  | "precision";

export const CAPABILITIES: Record<
  CapabilityKey,
  { label: string; source: string; blurb: string }
> = {
  spatial: {
    label: "Spatial Reasoning",
    source: "valves / ice",
    blurb: "One-way valves and frictionless ice force directional reasoning and multi-cell simulation before committing.",
  },
  planning: {
    label: "Planning Ahead",
    source: "irreversibility × search",
    blurb: "Tight budgets with irreversible moves: the winning line must be found before it is walked.",
  },
  dependencies: {
    label: "Object Dependencies",
    source: "buttons / gates / keys",
    blurb: "Chained preconditions — weight the plates to open the gate, hold keys for padlocks — SmartPlay's core axis.",
  },
  "state-tracking": {
    label: "State Tracking",
    source: "dirt / crumble",
    blurb: "World mutations that never revert: dug dirt stays open, crossed bridges stay fallen. The map in your head must update.",
  },
  "long-horizon": {
    label: "Long-Horizon Play",
    source: "par depth",
    blurb: "Optimal lines deep enough that step-local greed fails; credit assignment spans dozens of turns.",
  },
  risk: {
    label: "Risk Assessment",
    source: "spike fields",
    blurb: "Instant-death geometry separates confident spatial knowledge from hopeful guessing.",
  },
  precision: {
    label: "Choreography",
    source: "crate & body routing",
    blurb: "Tight corridors where the growing body and pushed crates must be parked exactly — one wasted move can seal the run.",
  },
};

export interface CapInput {
  grid: string[];
  dims?: Partial<Record<string, number>> | null;
  minMoves: number;
  turnLimit: number;
}

export interface CapabilityProfile {
  /** capability keys this level meaningfully tests */
  tags: CapabilityKey[];
  /** intensity 0-100 per capability (0 = not tested) */
  scores: Record<CapabilityKey, number>;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function capabilitiesOf(level: CapInput): CapabilityProfile {
  const all = level.grid.join("");
  const count = (re: RegExp) => (all.match(re) || []).length;
  const valves = count(/[><^v]/);
  const ice = count(/_/);
  const plates = count(/%/);
  const keys = count(/[kL]/);
  const dirt = count(/\+/);
  const bridges = count(/=/);
  const spikes = count(/~/);
  const d = level.dims ?? {};
  const sim = d.simulation ?? 0;
  const irrev = d.irreversibility ?? 0;
  const search = d.search ?? 0;
  const threat = d.threat ?? 0;
  const choreo = d.choreography ?? 0;
  const par = Math.max(1, level.minMoves);
  const tightness = clamp(1 - (level.turnLimit - par) / level.turnLimit); // 0..1

  const scores = {
    spatial:
      valves + ice > 0
        ? clamp(38 + 0.55 * sim + (valves > 0 ? 26 : 0) + (ice > 0 ? 14 : 0))
        : 0,
    planning: clamp(28 + 0.45 * irrev + 0.35 * search + 28 * tightness),
    dependencies:
      plates + keys > 0 ? clamp(42 + 11 * Math.min(4, plates + keys)) : 0,
    "state-tracking":
      dirt + bridges > 0 ? clamp(46 + 10 * Math.min(4, dirt + bridges)) : 0,
    "long-horizon": par >= 20 ? clamp(18 + 3.1 * par) : 0,
    risk: spikes > 0 ? clamp(46 + 0.54 * threat) : 0,
    precision: choreo >= 38 ? clamp(choreo) : 0,
  } as Record<CapabilityKey, number>;

  // A baseline of planning is intrinsic to every puzzle level; everything
  // else must be genuinely present in the geometry to earn its tag.
  const tags = (Object.keys(scores) as CapabilityKey[]).filter((k) => {
    if (k === "planning") return scores[k] >= 45;
    return scores[k] > 0;
  });

  return { tags, scores };
}
