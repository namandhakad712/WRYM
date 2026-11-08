# AGENTS.md — machine-readable guide to WRYM for AI agents

> If you are an LLM agent, coding agent, or evaluation harness reading this
> repository: this file is for you. It tells you how to run, extend, and
> benchmark against WRYM without reading the whole README.

## What this repository is

WRYM is a **deterministic, turn-based puzzle-game benchmark for language
models**. A worm moves on a grid; eat all apples, then reach the heart.
Eggs are gravity-bound cargo — drop one and the run is lost. Every level
has a **BFS-certified minimal-turn optimum**; difficulty is that optimum,
not vibes. Runs are executed locally, results are committed to `results/`,
and the static site on GitHub Pages is a pure function of that data.

- Repo: https://github.com/namandhakad712/WRYM
- Site: https://namandhakad712.github.io/WRYM/
- Human-playable mirror of the benchmark: `site/play.html` (same engine bundle)
- License: code MIT, level/run data CC BY 4.0, provenance in `NOTICE`

## The engine is the contract

`src/lib/wyrm/engine.ts` — deterministic, no RNG, no wall-clock
dependence. The browser bundle `site/assets/wyrm-engine.js` (built with
`bun build scripts/engine-browser-entry.ts --outfile site/assets/wyrm-engine.js --format iife --minify`)
exposes `globalThis.WYRM_ENGINE` with exactly:

```js
WYRM_ENGINE.createGame(levelDef)      // -> GameState        (levelDef: {name, slug, grid, turnLimit})
WYRM_ENGINE.step(state, action)       // -> {valid, state, reason}   action ∈ up|down|left|right|split
WYRM_ENGINE.serializeState(state)     // -> JSON string      (checkpoint / resume)
WYRM_ENGINE.deserializeState(json)    // -> GameState
WYRM_ENGINE.validateLevel(levelDef)   // -> {solvable, minMoves, difficulty, tier, ...}
WYRM_ENGINE.LEVELS                    // the certified 38-level ladder
```

Game states expose: `status` (`playing|won|dead|exhausted`), `turn`,
`turnLimit`, `worm[]`, `apples[]`, `eggs[]`, `keysHeld`, `lastEvents[]`.
The observation the models see is the text serialization in
`src/lib/wyrm/ascii.ts`; the overlay text is built by `buildOverlay()`.

**Never invent game rules.** If you need to know what an element does,
read `src/lib/wyrm/engine.ts` — every tile's semantics are documented in
the header comment of that file.

## Running the benchmark

```bash
bun install
bun run bench                 # full arena run (all models × levels)
bun run bench:solver          # the BFS reference line only (free, deterministic)
bun scripts/validate-tier3.ts # re-certify every level's optimum (CI does this too)
bun scripts/export-site.ts    # regenerate site/data/ from results/
```

Model credentials come from the environment (`apiKeyEnv` indirection in
`bench/models.json` / `site/data/models.json`) — never from files, never
committed. The built-in sandbox model `glm-4.6` needs no key and is the
zero-config fallback brain of the arena.

## Via MCP (Model Context Protocol)

`mcp/llm-bridge.mjs` is a stdio MCP server exposing one tool, `chat`,
that routes to the configured providers (OpenAI-compatible, Anthropic,
PiAPI bundle, built-in sandbox model). Point any MCP client at it:

```bash
bun mcp/llm-bridge.mjs
# then tools/call { name: "chat", arguments: { messages, model? } }
```

Test the chain without burning quota: `bun scripts/test-mcp.ts`.

## Contributing a level (agents welcome)

1. Open the Level Forge: https://namandhakad712.github.io/WRYM/forge.html
2. Build the level; the Forge runs the real validator in a Worker and
   shows the certificate (solvable, minMoves, difficulty, tier).
3. Playtest it (arrows + X), then **Export JSON** and open a PR adding it
   to `community-levels/<slug>.json`.
4. `wyrm-bot` auto-reviews: it re-certifies the level, checks the
   contributor card, and labels the PR. Maintainers merge.

A valid level must be: solvable by BFS, not solvable by accident (the
validator computes the true optimum), and self-contained ASCII (see the
character vocabulary in `src/lib/wyrm/engine.ts` CHARS).

## Reading results

- `site/data/index.json` — leaderboard, Elo (pooled Bradley-Terry + bootstrap CI), capability profiles
- `site/data/runs/<model>__<slug>.json` — full run: system prompt, every step, thoughts, checker verdict
- `site/data/levels.json` — the certified ladder with minMoves + difficulty per level
- Replays: `https://namandhakad712.github.io/WRYM/run.html?run=<runId>`

## Rules of engagement for agents

- Do not edit `results/` or `site/data/` by hand — regenerate them
  (`bun scripts/export-site.ts`); CI rejects hand-crafted numbers.
- Do not modify `src/lib/wyrm/engine.ts` semantics in a PR that also
  changes `results/` — engine changes require a full ladder re-run.
- Never commit credentials. `tests/secret-scan.test.ts` fails CI on token
  patterns.
- The difficulty index must stay solver-computed (`src/lib/wyrm/difficulty.ts`).
  "Feels hard" is not a measurable quantity here.
