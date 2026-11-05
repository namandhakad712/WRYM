// ── WRYM · browser engine bundle entry ────────────────────────────────
// Bundled (IIFE) into site/assets/wyrm-engine.js. This is the EXACT
// engine + validator + difficulty index that CI certifies the ladder
// with — the Level Forge in the docs site runs the same code, so a
// level that validates in the browser validates on the bench.
//
// Exposed as globalThis.WYRM_ENGINE (works on window AND in a Worker
// via importScripts).

import {
  createGame,
  step,
  replay,
  CHARS,
  serializeState,
  deserializeState,
  buildOverlay,
  platePositions,
  doorsOpen,
  platesSatisfied,
} from "../src/lib/wyrm/engine";
import { validateLevel, bfsSolution, stateKey } from "../src/lib/wyrm/validator";
import {
  computeDifficulty,
  tierOf,
  TIER_BLURB,
  TIER_ORDER,
} from "../src/lib/wyrm/difficulty";
import { HANDCRAFTED_LEVELS } from "../src/lib/wyrm/levels";

const api = {
  createGame,
  step,
  replay,
  CHARS,
  serializeState,
  deserializeState,
  buildOverlay,
  platePositions,
  doorsOpen,
  platesSatisfied,
  validateLevel,
  bfsSolution,
  stateKey,
  computeDifficulty,
  tierOf,
  TIER_BLURB,
  TIER_ORDER,
  LEVELS: HANDCRAFTED_LEVELS,
  VERSION: "3.1.0",
};

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as Record<string, unknown>).WYRM_ENGINE = api;
}

export default api;
