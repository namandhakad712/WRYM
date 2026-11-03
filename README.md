<div align="center">

# 𝐖𝐑𝐘𝐌 — The Worm Arena

### A deterministic game benchmark for language models

**Every run replayed · every thought archived · every claim certified**

[![benchmark](https://img.shields.io/badge/benchmark-agentic__arena-7c221a?style=flat-square)](#the-benchmark)
[![levels](https://img.shields.io/badge/levels-20%20BFS--certified-221c14?style=flat-square)](#the-ladder)
[![pages](https://img.shields.io/badge/site-github%20pages-221c14?style=flat-square)](https://namandhakad712.github.io/WRYM/)
[![license](https://img.shields.io/badge/license-MIT-3a3226?style=flat-square)](#license)
[![engine](https://img.shields.io/badge/engine-deterministic%20v2-8a6a42?style=flat-square)](#the-game)

<br>

*Run it locally. Commit the results. The leaderboard is a pure function of committed data.*

<br>

![WRYM leaderboard — paper aesthetic, engraved plates, real boards](site/assets/img/leaderboard.png)

</div>

---

## Table of contents

1. [What is WRYM?](#what-is-wrym)
2. [The game](#the-game)
3. [The ladder — 20 certified levels](#the-ladder--20-certified-levels)
4. [The GitHub flow: local runs → committed results → Pages](#the-github-flow-local-runs--committed-results--pages)
5. [The dashboard (local control room)](#the-dashboard-local-control-room)
6. [The agentic pipeline](#the-agentic-pipeline)
7. [Reliability engine — retries, fallbacks, rate limits, context windows](#reliability-engine--retries-fallbacks-rate-limits-context-windows)
8. [How to read a replay (visualization guide)](#how-to-read-a-replay-visualization-guide)
9. [Isolation model](#isolation-model)
10. [Quickstart](#quickstart)
11. [Configuring models (bench/models.json)](#configuring-models-benchmodelsjson)
12. [Project layout](#project-layout)
13. [Documentation set](#documentation-set)
14. [Verification & tests](#verification--tests)

---

## What is WRYM?

WRYM (pronounced *worm*) is a **Kaggle-Game-Arena-style benchmark** in which
language models play a hard, fully deterministic grid puzzle through a text
interface — while an agentic pipeline designs levels, proves them solvable,
replays every run, certifies every claim, and ranks the models by pairwise Elo.

Three properties make it a *benchmark* and not a demo:

| Property | Mechanism |
| --- | --- |
| **Uncheatable** | A model never grades itself. A separate deterministic **Checker** re-executes the recorded actions on a fresh engine and signs the run `CERTIFIED` or `INVALID`. |
| **Unmemorizable** | Levels are generated and certified continuously (LLM + procedural designers); difficulty is engineered so frontier models fail *informatively*. |
| **Unstoppable** | A production reliability engine — retries, `Retry-After`-aware backoff, quota circuit breakers, rate limiters, context-window fitting, fallback chains — wraps every model call. |

Everything is real. The engine is pure functions. The worm is an earthworm.
The leaderboard is a static page generated from JSON that anyone can audit
line by line.

<div align="center">
<img src="site/assets/img/replay-llm.png" alt="Run replay: the board on the left, the model's mind on the right" width="86%">
</div>

---

## The game

A worm must eat every apple and reach its **burrow**. The wrinkle: it *grows*
with every apple, and the corridors were not built for a growing worm.

| | | |
|:---:|:---:|:---:|
| 🍎 **Apples** — eat to grow; the exit stays sealed until the plate is clean | ✂️ **Split** — sever the body; the dropped half stays as solid, weighted remains | 📦 **Crates** — sokoban pushes onto pressure plates |
| ⚙️ **Plates & doors** — a door stays sealed while any plate stands unweighted | 🕳️ **Dirt** — dig through, spending a turn | 🗡️ **Spikes** — instant death, even mid-slide |
| 🚪 **Valves** `> < ^ v` — enter only *with* the arrow; one-way law | ❄️ **Ice** — slide until stopped; one action, many cells | 🌉 **Bridges** — crumble the instant the last weight leaves |
| 🔑 **Keys & locks** — inventory bookkeeping under budget | ⏱️ **Turn budgets** — every level is a clock | 🕳️ **The burrow** — the only way out |

The model's **only** interface is a projected text observation: the ASCII
board, the rules, its move history, and the engine's verdict on every invalid
action. No screenshots. No engine internals. It must *simulate the world in
its head* — which is precisely the skill being measured.

---

## The ladder — 20 certified levels

Every level is certified by exhaustive breadth-first search **before** it may
enter the ladder: solvability, the optimal move count (*par*), the size of the
search space, and a structural difficulty 1–10.

| Tier | Levels | Families | The idea |
| --- | --- | --- | --- |
| I · Foundations | 01–06 | movement, crates, plates, split, spikes | learn the physics |
| II · Mechanics | 07–12 | keys, ice, valves, bridges, machinery | one-way geometry, forced simulation, bookkeeping |
| III · **The Gauntlet** | 13–20 | everything, interlocked, under budget | **designed so models fail** |

<div align="center">
<img src="site/assets/img/levels.png" alt="Level gallery with rendered boards" width="86%">
</div>

The Gauntlet's traps are structural, not decorative:

- **The Siphon (16)** — the exit door needs *two* plates weighted but there is
  one crate. The worm must shed its own mass onto the far plate — **twice** —
  then slither through as a single segment.
- **Ratchet & Frost (14)** — the crate must ride *down over a one-way valve*
  onto its plate; every approach is an ice slide; eating an apple on a slide
  lane means overshooting into the next room.
- **The Gaol (19)** — the far plate is reachable only by a body segment parked
  there with head *past* it; the geometry forbids spanning plate and door, so
  the split is forced, not optional.
- **WYRM Crown (20)** — lock descent, ice lanes, a plate-door, a one-way
  bridge span whose first landing is spiked, and a valve mouth into the
  burrow. Difficulty 9/10, par 46, budget 100.

> **Failure is the instrument.** Partial credit (apples eaten, moves survived,
> deaths avoided) keeps every failure informative — a model that dies on the
> spikes in 3 moves has told you something.

---

## The GitHub flow: local runs → committed results → Pages

The computation is local. The truth is committed. The website is a pure archive.

```
┌────────────────────────── YOUR MACHINE ──────────────────────────┐
│                                                                  │
│  bench/models.json ──▶  bun scripts/run-benchmark.ts             │
│  (models, rate          · BFS baseline: provably optimal play    │
│   limits, context       · every LLM: full agentic play, all      │
│   windows, fallbacks)     thoughts + telemetry recorded          │
│         │                                                        │
│         ▼                                                        │
│  results/  ├── models.json        (entrant registry)             │
│             ├── levels.json       (certified ladder)             │
│             └── runs/<model>/<level>.json                        │
│                  every step: thought, raw reply, observation     │
│                  size, latency, retries, checker verdict         │
│         │                                                        │
│         ▼  git commit + push                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌─────────────────────────── GITHUB ───────────────────────────────┐
│  Actions: re-certify ladder → re-export archive → deploy Pages   │
│                                                                  │
│  site/  ├── index.html      leaderboard + coverage (pure HTML)   │
│         ├── levels.html     gallery, every board engraved        │
│         ├── run.html        replay viewer: board + model's mind  │
│         └── data/*.json     generated from committed results     │
└──────────────────────────────────────────────────────────────────┘
```

**Zero computation at view time.** The exporter (`scripts/export-site.ts`)
computes the Elo standings, efficiency ratios and reliability aggregates once,
at commit time. `site/` is static — no backend, no database, no API keys — so
GitHub Pages serves it for free, forever.

Run everything yourself:

```bash
bun scripts/run-benchmark.ts --models glm-4.6 --levels 13,16,20   # play (local, keys via env)
bun scripts/export-site.ts                                        # rebuild the archive
git add results/ site/data/ && git commit -m "results: <model> × <levels>"
git push                                                          # Pages redeploys automatically
```

Adding a model is a JSON edit (see [bench/models.json](bench/models.json)) —
keys travel in environment variables, never in the repository.

---

## The dashboard (local control room)

`bun run dev` opens the full **paper-aesthetic control room** at
`localhost:3000` — the same deterministic engine, live:

- **Plays** — every run with the dual view: the AI's *text world*
  (teleprinter page) beside the human *engraved board*, step scrubber,
  per-step sandbox audits.
- **Mid-run control** — watch tokens stream, then **pause / resume /
  interrupt / steer** the model while it is thinking. Operator steering is
  injected into the observation stream, marked `OPERATOR STEERING`.
- **The Loop** — the sustained agentic cycle: generate → validate → solve →
  check → review → Elo, with the reviewer's coaching flowing back into the
  next run.
- **Forge** — level editor + Feature Builder palettes; BFS-validate before
  anything is stored.
- **Admin** — provider console with the full reliability contract per
  provider (context window, RPM/TPM, concurrency, timeout, retries, backoff,
  cost, fallback chain) and live reliability telemetry.

---

## The agentic pipeline

| Role | Brain | Duty |
| --- | --- | --- |
| **Thinker** | any LLM | Plays turn by turn: reads the observation, reasons aloud, answers `{"thought", "action"}`. Every word it says is persisted. |
| **New Level Thinker** | any LLM | Designs original levels, mentally simulating them; the validator has veto power. |
| **Checker** | none | Deterministic replay certification. The model can never grade itself. |
| **Reviewer** | any LLM | Post-run critique → becomes the next run's coach hints. The loop remembers. |
| **WYRM-BFS** | none | Exhaustive solver — the provably optimal par line that anchors Elo. |

---

## Reliability engine — retries, fallbacks, rate limits, context windows

Every model call passes through a pipeline modelled on LiteLLM / OpenRouter
gateways (full spec: [`docs/LLM_RESILIENCE.md`](docs/LLM_RESILIENCE.md)):

```
chain resolve → circuit gate → context fit → rate limiter (RPM/TPM/slots)
             → execute + timeout → classify → retry / refit / failover
             → telemetry (attempts, waits, tokens, cost)
```

- **Errors are classified, then handled**: 429-with-`Retry-After` backs off
  with jitter; quota trips open a 10-minute breaker and fail over *now*;
  auth/config errors never retry; context overflow re-fits the payload
  smaller once, then fails over; operator interrupts stop everything.
- **Rate limits are enforced client-side** (sliding-window RPM/TPM +
  concurrency slots) *before* a request touches the vendor.
- **Context windows are configurable per model**; over-budget conversations
  drop the oldest pairs and leave a visible `[context truncated…]` marker —
  the current observation and system rules always survive.
- **Fallback chains** (≤ 4 hops, cycle-safe) end at the built-in model;
  rescued calls are flagged `degraded` in the archive.
- **Every step's audit** — bytes in/out, latency, verdict, attempt trail — is
  committed with the run. The replay page renders it as a *reliability ledger*.

This is not theoretical. The archive's GLM-4.6 runs were played during a
sustained upstream rate-limit storm: one run won, one died on spikes, three
were aborted **honestly** after classified retries — with the full attempt
trail committed for anyone to inspect.

---

## How to read a replay (visualization guide)

Open any run from the [leaderboard](https://namandhakad712.github.io/WRYM/)
(`run.html?m=<model>&l=<level>`). The page is a two-column instrument:

**Left — the board (human view).** The same deterministic state the AI parsed
as ASCII, drawn as a naturalist's engraving: archival paper, iron-gall ink,
cross-hatched bedrock. Elements are drawn as what they *are* — a riveted brass
pressure plate, a plank door with iron bands and a wax seal, a soil mound with
pebbles and a root, a steel spike bed, a rope-lashed bridge, a dark burrow
mouth. And the worm is an **earthworm**: rose-tan, annulate, blunt-snouted,
with shy bead eyes — never a snake.

**Right — the mind (AI view).** A teleprinter page in inverted ink: the
model's recorded thought for the current step, its raw reply verbatim, the
action chip (green = accepted, red = rejected with the engine's reason), and
step telemetry (latency, observation bytes).

**The controls.** `▶ play` autoplays at reading pace; the scrubber jumps to
any step; `final ⇥` jumps to the outcome. The event strip under the board
prints the engine's events for the current step — `slide ×4`, `bridge
crumbles`, `plates 1/2`, `SPIKES`.

**The verdict line.** `WON · checker CERTIFIED · 17 moves (par 7, budget
120)`. The Checker's signature is the run's credibility: every frame you see
was re-executed on a fresh engine and matched exactly.

---

## Isolation model

Five auditable layers (details in the [white paper](docs/whitepaper.pdf)):

1. **L1 — observation firewall**: the model sees only the frozen projected text.
2. **L2 — output quarantine**: replies are schema-checked before touching the engine.
3. **L3 — resource limits**: turn budgets, byte accounting, latency caps.
4. **L4 — secret isolation**: API keys never leave the server/repo.
5. **L5 — deterministic replay**: the Checker re-executes everything, anywhere, forever.

Docker wraps the arena in one more reproducibility layer (see
[`DOCKER.md`](DOCKER.md)): single image, unprivileged runtime, persistent
SQLite volume.

---

## Quickstart

```bash
bun install
bun run db:push          # apply the Prisma schema
bun run dev              # control room → http://localhost:3000
```

First boot bootstraps itself: models, the 20-level certified ladder, no demo
noise. Add a provider in **Admin → Add provider**, or run headless:

```bash
# the par line (no API needed — deterministic)
bun scripts/run-benchmark.ts --models wyrm-bfs

# a real model (keys via env, never committed)
export OPENAI_API_KEY=sk-...        # then enable the model in bench/models.json
bun scripts/run-benchmark.ts        # full suite: all enabled models × 20 levels

# rebuild the archive and ship it
bun scripts/export-site.ts
```

Levels (subset / override):

```bash
bun scripts/run-benchmark.ts --levels 13,16,20 --models glm-4.6 --attempts 1
bun scripts/validate-tier3.ts            # re-certify the whole ladder
```

Containers:

```bash
docker compose up --build
```

---

## Configuring models (bench/models.json)

Each entrant is a JSON object; resilience fields map 1:1 onto the provider
reliability engine (`0`/absent = engine default):

| Field | Meaning |
| --- | --- |
| `kind` | `zai` (built-in), `openai`, `anthropic`, `google`, `openrouter`, `groq`, `deepseek`, `mistral`, `xai`, `together`, `ollama`, `lmstudio`, `custom` — any OpenAI-compatible endpoint |
| `apiKeyEnv` | **name** of the environment variable holding the key (keys are never committed) |
| `modelId`, `baseUrl` | vendor identifiers; sensible defaults per kind |
| `contextWindow` | custom context size in tokens; `0` = auto by kind (8k local → 1M Gemini) |
| `rpm` / `tpm` / `concurrency` | client-side rate limiting, enforced before the vendor sees anything |
| `timeoutMs` | per-request hard timeout |
| `maxRetries` / `retryBaseMs` | retry budget + exponential backoff base (full jitter, `Retry-After` honored) |
| `costPerMtok` | blended $/1M tokens → spend telemetry |
| `fallback` | next model key when this one dies (chain ≤ 4 hops, cycle-safe) |
| `enabled` | `false` = registered but not run |

The same schema drives the dashboard's Admin console — what you probe is what
the arena runs.

---

## Project layout

```
bench/
  models.json               benchmark entrants + resilience contracts
results/                    committed archive: runs/, models.json, levels.json
site/                       GitHub Pages archive (static; zero compute)
  index.html  levels.html  run.html
  assets/wyrm.css           "laboratory paper" theme
  assets/wyrm-render.js     vanilla canvas renderer (engraved plates)
  assets/wyrm-app.js        leaderboard + replay engine
  data/                     generated by scripts/export-site.ts
  assets/img/               screenshots (also used by this README)
src/lib/wyrm/
  engine.ts                 pure deterministic game engine (v2 mechanics)
  levels.ts                 the 20-level certified ladder
  validator.ts              BFS certification (solvable, par, difficulty)
  generator.ts              procedural level generator
  orchestrator.ts           the sustained agentic loop
  runcontrol.ts             pause / resume / interrupt / steer + event bus
  sandbox.ts                L1–L5 isolation + audit records
  ascii.ts                  observation projection + prompts
  elo.ts                    pairwise Elo
  agents/                   thinker, levelThinker, checker, reviewer, llm
  llm/                      types, tokens, ratelimiter, resilience, client
src/components/wyrm/        dashboard views (paper aesthetic)
src/app/api/                REST + SSE routes
scripts/
  run-benchmark.ts          headless runner → results/
  export-site.ts            results/ → site/data (all leaderboard math)
  validate-tier3.ts         re-certify the ladder (CI runs this)
  sim-manual.ts / debug-level.ts   level design instruments
docs/
  LLM_RESILIENCE.md         reliability engine specification
  BENCHMARK_LANDSCAPE.md    how famous LLM benchmark systems actually work
  whitepaper.pdf            the formal write-up
.github/workflows/          re-certify + re-export + deploy Pages
Dockerfile, docker-compose.yml, DOCKER.md
```

---

## Documentation set

| Document | Contents |
| --- | --- |
| **README.md** (this file) | system overview, the GitHub flow, methodology, replay guide |
| [`docs/LLM_RESILIENCE.md`](docs/LLM_RESILIENCE.md) | reliability engine spec: taxonomy, policies, limits, breakers, chains, config |
| [`docs/BENCHMARK_LANDSCAPE.md`](docs/BENCHMARK_LANDSCAPE.md) | lm-eval-harness, HELM, OpenAI Evals, SWE-bench, Chatbot Arena, Kaggle Game Arena, BALROG — how they work, what's open source, WRYM's conformance map |
| [`docs/whitepaper.pdf`](docs/whitepaper.pdf) | game formalization, mechanic taxonomy, difficulty engineering, isolation model, control plane |
| [`bench/models.json`](bench/models.json) | the entrant registry, self-documented |

---

## Verification & tests

```bash
bun scripts/validate-tier3.ts     # BFS re-certification of all 20 levels (CI runs this)
bun scripts/test-mechanics.ts     # engine v2 mechanics
bun scripts/test-levels.ts        # ladder validation
bun scripts/test-reliability.ts   # reliability pipeline smoke test
bun run lint                      # eslint
```

The reliability smoke test asserts observable behavior end-to-end: truncation
markers appear, the final observation survives fitting, 429-quota classifies
as failover-not-retry, a dead endpoint fails over to the built-in model in
<1 s, and every logical call lands a telemetry row.

---

<div align="center">
<sub>WRYM — the worm arena. The engine is deterministic, the checker is
relentless, the leaderboard is static, and the worm is an earthworm.<br>
Runs executed locally · results committed · site served by GitHub Pages.</sub>
</div>
