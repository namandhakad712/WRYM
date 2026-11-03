# The LLM Benchmarking Landscape — and where WYRM.LAB sits in it

**Status:** research analysis · November 2026
**Scope:** how production LLM evaluation systems are actually built — the famous
benchmarks, their harness architectures, what is open source, and which patterns
WYRM.LAB adopts (and why).

---

## 1. Why this document exists

A benchmark is not a dataset. It is a **system**: a task registry, an execution
harness, an adapter layer that talks to models, an isolation boundary, a scoring
pipeline, and — in every serious deployment — a reliability layer that keeps the
whole thing running when a vendor rate-limits you at 3 a.m. This document maps
that system landscape, then states precisely what WYRM.LAB borrowed.

The short version:

| If you remember one thing per system | |
| --- | --- |
| lm-evaluation-harness | Tasks are **data** (YAML), models are **adapters** |
| HELM | Evaluate **holistically** — many metrics per run, not one accuracy |
| OpenAI Evals | Registry + **Completion Function Protocol** for chains/tools |
| SWE-bench | **Docker per task instance** = reproducible agentic grading |
| Chatbot Arena | **Pairwise battles + Elo** beat absolute scores |
| Kaggle Game Arena | **Games** resist saturation; competition makes it evergreen |
| BALROG | Games measure **long-horizon agentic** ability, not QA recall |
| LiteLLM / OpenRouter | **Retries, fallbacks, cooldowns, budgets** are the real API layer |

---

## 2. The systems

### 2.1 lm-evaluation-harness (EleutherAI) — the de facto standard

- **What it is:** a Python CLI/library that evaluates any model on any of ~400
  tasks. It powers the Hugging Face Open LLM Leaderboard lineage.
- **Open source:** yes (MIT). <https://github.com/EleutherAI/lm-evaluation-harness>
- **How it works:**
  1. **Task registry** — every task is a YAML file (dataset, prompt template,
     few-shot split, metrics, filters). `lm_eval --tasks list` enumerates them.
     Contributing a benchmark = contributing data + YAML, not code.
  2. **Model adapters** — one interface, many backends: local HF weights,
     API endpoints (`--model openai-chat-completions --model_args
     base_url=…,token=…`), vLLM. The harness never talks to a vendor directly.
  3. **Execution** — few-shot assembly (`--num_fewshot 5`), request batching,
     generation → **filters** (stateful, chainable post-processors) →
     **metrics** computed in `process_results`.
  4. **Logging** — `--log_samples` persists every model I/O pair;
     `--predict_only` runs generation without scoring (for human/external
     grading, e.g. LLM-as-judge via filters).
- **What WYRM.LAB adopted:** the *adapter* doctrine (one uniform target spec
  drives every vendor — our `Provider` rows + protocol families), the
  *task-as-data* idea (levels are rows, not code), and full per-sample
  logging (every step persists obs → thought → action → audit).

### 2.2 HELM (Stanford CRFM) — holistic, transparent, living

- **What it is:** a framework for *transparent* evaluation across scenarios,
  metrics, and models. Classic HELM: 42+ scenarios; HELM Lite (v1.0.0): a
  cost-efficient regular-eval subset (narrative, math, legal, medicine,
  translation).
- **Open source:** yes (Python). <https://crfm.stanford.edu/helm/classic/v0.2.2>
- **How it works:** the unit is a **Run** = (scenario, model, adapter
  config). Runs are executed by an orchestrator; every prediction is stored;
  metrics are computed per run **plus slices**: robustness (perturbations),
  fairness (across demographic mentions), bias, toxicity, calibration,
  efficiency (latency, tokens). The leaderboard shows all of it — a model is a
  column vector, not a scalar.
- **What WYRM.LAB adopted:** multi-metric scoring per run — we never report
  "solved/failed" alone: move efficiency vs the BFS optimum (`minMoves`),
  death count, invalid-action rate, latency, token spend, and the Reviewer's
  qualitative ratings all attach to the same run record.

### 2.3 OpenAI Evals — the registry pattern

- **What it is:** OpenAI's evaluation framework; now also native in the
  OpenAI dashboard.
- **Open source:** yes. <https://github.com/openai/evals>
- **How it works:** evals live in a **registry** (YAML, Git-LFS datasets).
  Standard templates (model-graded, multiple choice) cover common cases; the
  **Completion Function Protocol** chains prompts and tools for agentic
  evals; Snowflake logging is optional. The doctrine: *an eval is a
  first-class artifact you version and review*, and model-graded evals are
  legitimate when the grader itself is versioned.
- **What WYRM.LAB adopted:** treating the **LLM-as-judge as a versioned,
  sandboxed role** — our Reviewer and Checker run through the same provider
  machinery as the player model, with their prompts persisted on every run.

### 2.4 SWE-bench — reproducible agentic grading

- **What it is:** the reference agentic coding benchmark (resolve real GitHub
  issues); *Verified* is the human-validated subset.
- **Open source:** yes, including Multimodal v2 (480 tasks runnable locally).
  <https://www.swebench.com>
- **How it works:** each task instance ships a **Docker environment** of the
  repo at the right commit. The harness gives the agent the issue, receives a
  patch, applies it in the container, and runs the repo's **test suite** —
  grading is execution, not string matching. Fail-to-pass tests define
  success. Docker is the isolation *and* the reproducibility mechanism.
- **What WYRM.LAB adopted:** the isolation-first doctrine (see §4): the model
  never touches the engine, only a projected text observation; the engine
  replays and certifies every run deterministically. Our Docker deployment
  (`DOCKER.md`) makes the whole arena itself reproducible.

### 2.5 Chatbot Arena / LMArena (LMSYS) — battles, not scores

- **What it is:** crowdsourced evaluation — two anonymous models answer the
  same prompt, humans vote, Elo/Bradley-Terry ratings emerge from millions of
  pairwise battles. The canonical methodology write-up:
  <https://lmsys.org/blog/2023-05-03-arena>
- **Open source:** voting data and FastChat serving stack are open; the Elo
  notebooks are published.
- **How it works:** pairwise battles → expected-score update
  `Ea = 1/(1+10^((Rb−Ra)/400))`, rating updated by actual vs expected score.
  Pairwise comparison is robust because judges never need an absolute rubric.
  (Later refinements moved to Bradley-Terry MLE over all battles at once.)
- **What WYRM.LAB adopted:** pairwise Elo on **shared levels** — every model
  that runs the same level is compared against every other, win credit
  weighted by efficiency and the BFS par. The arena view makes those battles
  first-class.

### 2.6 Kaggle Game Arena (Google DeepMind × Kaggle) — games as evergreen eval

- **What it is:** an open, ever-expanding platform evaluating LLMs through
  **competitive games** (chess and beyond), launched to address the
  saturation and overfitting of static benchmarks. Paper: *Game Arena:
  Strategic LLM Evaluation in Competitive Environments*
  (<https://www.researchgate.net/publication/414867635_Game_Arena_Strategic_LLM_Evaluation_in_Competitive_Environments>).
- **How it works:** models enter matches as players; the platform mediates
  moves, enforces legality, records everything, and ranks by results. Because
  games are generative and adversarial, there is no answer key to leak into
  training data — a new map **is** a new test.
- **What WYRM.LAB adopted:** this is our direct lineage — a game arena where
  the benchmark *generates its own levels* (New Level Thinker + procedural
  generator), so the eval set cannot be memorized, and difficulty is tuned so
  that failure is informative (models **must** fail — a benchmark everyone
  aces measures nothing).

### 2.7 BALROG — long-horizon agentic game eval

- **What it is:** an academic benchmark of agentic LLM/VLM reasoning across
  six game environments (BabyAI, Crafter, BabaIsAI, MiniHack, NetHack and
  friends). <https://www.alphaxiv.org/replicate/2411.13543>
- **How it works:** agents act in text (and optionally pixel) game loops;
  scoring recognizes **partial progress** (game-score deltas, not just
  win/loss); results showed frontier models degrade sharply on long-horizon
  planning vs their static-benchmark scores — exactly the gap game arenas
  exist to expose.
- **What WYRM.LAB adopted:** partial-credit scoring (apples eaten, moves vs
  optimum, per-attempt records), and the design stance that **turn budgets +
  mechanic interactions** (valves → bridges → ice → keys) are how you make
  long-horizon failure visible.

### 2.8 LiteLLM & OpenRouter — the reliability layer nobody benchmarks but everyone needs

- **What they are:** production LLM gateways. LiteLLM (open source):
  <https://docs.litellm.ai/docs/completion/reliable_completions>,
  <https://docs.litellm.ai/docs/proxy/reliability>. OpenRouter: a commercial
  router across hundreds of models.
- **How they work:**
  - **Retries** stay inside a model group; **fallbacks** leave it for the
    next group. Two distinct axes, configured separately.
  - **Rate limits** (RPM/TPM) enforced client-side with budgets per
    team/model; 429s from upstream trigger **cooldowns** — the model goes
    quiet for N seconds and traffic shifts.
  - Backoff is **exponential with jitter** and honors `Retry-After` headers;
    without jitter, retrying clients synchronize into thundering herds.
- **What WYRM.LAB adopted (v3):** all of it, in-process — per-provider
  retry budgets, Retry-After-aware backoff with full jitter, quota trips that
  open a circuit breaker for 10 minutes, sliding-window RPM/TPM/concurrency
  limits, and a cycle-safe fallback chain that ends at the built-in model.
  See `docs/LLM_RESILIENCE.md`.

---

## 3. Architecture pattern synthesis

Across every system above, five layers recur:

```
┌──────────────────────────────────────────────────────────────────┐
│ ① TASK REGISTRY      tasks/levels as versioned DATA, not code    │
│    (harness YAML · HELM scenarios · WYRM Level rows + Forge)     │
├──────────────────────────────────────────────────────────────────┤
│ ② ADAPTER LAYER      one uniform interface → many vendors        │
│    (harness model adapters · pi-style providers · LiteLLM SDK)   │
├──────────────────────────────────────────────────────────────────┤
│ ③ EXECUTION HARNESS  the loop: obs → model → action → engine     │
│    + RELIABILITY     retries · rate limits · fallbacks (v3)      │
├──────────────────────────────────────────────────────────────────┤
│ ④ ISOLATION          the model can only see/emit what the        │
│    harness projects (SWE-bench Docker · WYRM sandbox L1–L5)      │
├──────────────────────────────────────────────────────────────────┤
│ ⑤ SCORING + TELEMETRY deterministic grading, per-sample logs,    │
│    Elo/multi-metric, cost & latency accounting                   │
└──────────────────────────────────────────────────────────────────┘
```

**The reliability layer (③b) is the least glamorous and most decisive.**
Every production operator we studied independently converged on the same
policies: classify errors before reacting (a quota trip is not a rate limit),
honor `Retry-After`, jitter everything, open circuit breakers on systemic
failure, and fail over horizontally before the caller notices. A benchmark
that loses runs to a 429 is producing scientific noise.

---

## 4. WYRM.LAB conformance map

| Pattern | Source system | WYRM.LAB implementation |
| --- | --- | --- |
| Task-as-data registry | lm-eval-harness | `Level` table; Forge editor; Feature Builder palettes; LLM + procedural generators |
| Uniform multi-vendor adapter | lm-eval-harness, pi, LiteLLM | `Provider` rows → 4 protocol families (OpenAI-compat, Anthropic, Google, built-in SDK) |
| Retry / rate-limit / fallback | LiteLLM, OpenRouter | `src/lib/wyrm/llm/{resilience,ratelimiter,client}.ts` — per-provider budgets, breakers, cycle-safe chains |
| Context management | agent-harness practice | char/CJK token estimate → budget fit → oldest-pair truncation with visible marker |
| Isolation boundary | SWE-bench Docker | Sandbox layers L1–L5 (observation firewall, output quarantine, resource limits, secret isolation, deterministic replay) + Docker deployment |
| Multi-metric runs | HELM | score vs BFS par, deaths, invalid rate, latency, tokens, cost, Reviewer ratings |
| Pairwise Elo | Chatbot Arena | per-level all-pairs Elo with efficiency weighting |
| Generated, adversarial tasks | Kaggle Game Arena, BALROG | New Level Thinker + procedural generator, difficulty ladder 1→10 designed so frontier models fail informatively |
| Per-sample logging | lm-eval-harness `--log_samples` | every step: obs, raw output, thought, board, state JSON, sandbox audit, attempt trail |
| LLM-as-judge as versioned role | OpenAI Evals | Reviewer/Checker roles run through the same provider + reliability machinery |
| Reproducible deployment | SWE-bench | `docker compose up` single-image with persistent volume |

## 5. Deliberate divergences

1. **Single-process in-app state** (SQLite + in-process breakers/limiters)
   instead of a separate gateway service. Right for a self-contained arena;
   the isolation boundary that matters is between *model* and *engine*, not
   between our own services.
2. **Text-first game interface** rather than pixels: deterministic replay and
   token-level auditing matter more for us than visual realism at the model
   boundary (the human view renders the same state graphically).
3. **Failure-seeking difficulty**: most benchmarks aim for discrimination at
   the top; we deliberately tune upper levels past the frontier so
   headroom and failure modes are visible — the information is in the
   failure, not the pass.

## 6. Sources

- EleutherAI, *lm-evaluation-harness* — <https://github.com/EleutherAI/lm-evaluation-harness>
  (task registry, adapters, `--log_samples` / `--predict_only`, filters → metrics)
- SambaNova, *LM Evaluation Harness integration guide* — <https://docs.sambanova.ai/docs/en/integrations/lm-evalharness>
- Stanford CRFM, *HELM* — <https://crfm.stanford.edu/helm/classic/v0.2.2>
- OpenAI, *Evals* — <https://github.com/openai/evals>, guide at <https://developers.openai.com/api/docs/guides/evals>
- SWE-bench — <https://www.swebench.com> (Docker-based harness; Verified subset)
- LMSYS, *Chatbot Arena: Benchmarking LLMs in the Wild with Elo Ratings* — <https://lmsys.org/blog/2023-05-03-arena>
- *Game Arena: Strategic LLM Evaluation in Competitive Environments* (Kaggle/DeepMind) — <https://www.researchgate.net/publication/414867635_Game_Arena_Strategic_LLM_Evaluation_in_Competitive_Environments>
- *BALROG: Benchmarking Agentic LLM and VLM Reasoning On Games* — <https://www.alphaxiv.org/replicate/2411.13543>
- LiteLLM, *Reliability — Retries, Fallbacks* — <https://docs.litellm.ai/docs/completion/reliable_completions>;
  *Fallbacks (Provider Failover)* — <https://docs.litellm.ai/docs/proxy/reliability>
