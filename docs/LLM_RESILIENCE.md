# The LLM Reliability Engine

**Applies to:** WYRM.LAB v3 · `src/lib/wyrm/llm/`
**One-line summary:** every model call is carried by a pipeline that
classifies failures, retries what is transient, waits when rate-limited,
shrinks what overflows, and fails over when a provider dies — and writes an
audit trail of every decision.

---

## 1. Why it exists

A benchmark arena makes **thousands** of model calls per session. Without a
reliability layer, three things go wrong:

1. **Vendor flakiness becomes scientific noise.** A 429 in the middle of a
   level looks identical to a model failure. Runs die, Elo skews.
2. **Quota exhaustion kills long sessions.** One exhausted billing account
   shouldn't end the benchmark.
3. **Contexts silently overflow.** Different providers have different
   windows (8k local → 1M Gemini); a fixed history cap either starves big
   models or crashes small ones.

The engine is modelled on what production gateways (LiteLLM, OpenRouter)
do, implemented in-process so a self-hosted arena gets it with zero extra
infrastructure.

---

## 2. The pipeline

Every `chat()` call (all four agent roles + the admin Test button) flows:

```
resolve role chain          primary (priority desc) → fallback → … → built-in
        │
        ▼ per candidate ────────────────────────────────────────────┐
  ① circuit gate          open breaker? → skip to next candidate    │
  ② context fit           estimate tokens → drop oldest pairs →     │
                          marker; hard-truncate oversize tails       │
  ③ rate limiter          sliding-window RPM/TPM + concurrency      │
                          slots; abort-aware waiting                 │
  ④ execute               raw protocol transport + hard timeout     │
  ⑤ classify              see the taxonomy below                    │
  ⑥ decide                retry (backoff) / refit (context) /       │
                          trip breaker + failover / abort            │
        └── on terminal failure → next candidate ───────────────────┘
  ⑦ telemetry             one LlmCall row per logical call, full
                          attempt log inside
```

Files:

| File | Responsibility |
| --- | --- |
| `llm/types.ts` | `LLMTarget` + resilience knobs, engine defaults, error taxonomy types |
| `llm/tokens.ts` | char/CJK token estimation, `fitToContext` |
| `llm/ratelimiter.ts` | sliding-window limiter, concurrency slots, circuit breaker |
| `llm/resilience.ts` | error classification, retry policies, jittered backoff |
| `llm/client.ts` | transport + pipeline orchestration (`llmChat`) |
| `agents/llm.ts` | role → chain resolution, telemetry writes, cost tracking |

---

## 3. Error taxonomy and policy matrix

| Class | Typical cause | Retry same provider? | Backoff | Failover? | Breaker effect |
| --- | --- | --- | --- | --- | --- |
| `rate_limit` | HTTP 429 (non-billing) | yes (≤ maxRetries) | honor `Retry-After`; else `max(base×3·2ⁿ)` + full jitter, cap 60 s | after budget exhausted | counts as failure |
| `quota` | 429 w/ quota/billing text | **no** | — | **immediately** | **opens circuit for 10 min** |
| `auth` | 401/403 | no | — | immediately | none (config problem) |
| `context` | 400 "context length / too many tokens" | once with **re-fitted (0.6×) payload** | none (payload changed) | if refit also fails | counts as failure |
| `server` | 5xx, empty streams | yes | `base·2ⁿ` + jitter, cap 30 s | after budget | failure count |
| `network` | DNS/reset/refused (`fetch failed`, "unable to connect") | yes | as `server` | after budget | failure count |
| `timeout` | per-request hard timeout | yes | as `server` | after budget | failure count |
| `invalid` | 400/404 not context-related | no | — | immediately | none |
| `aborted` | operator INTERRUPT | **never** | — | **never** (stops the whole chain) | none |

`Retry-After` parsing supports both delta-seconds and HTTP-date, clamped to
4× the rate cap.

**Why quota ≠ rate limit:** a rate limit means "you are fast, wait a bit" —
retry the same provider. A quota means "this account is done for now" — every
retry is wasted money and time, so the breaker opens for 10 minutes and the
chain advances instantly.

---

## 4. Rate limiting & concurrency

Per-provider sliding window (60 s), enforced **client-side before the request
leaves the process**:

- **RPM** — max requests per minute. A request that would exceed the window
  waits until the oldest timestamp ages out (in ≤ 1 s slices, abort-aware).
- **TPM** — max estimated tokens per minute (prompt + reserved completion).
  Waits until enough spent tokens age out.
- **Concurrency** — max parallel in-flight requests (semaphore).

All three accept `AbortSignal`, so an operator pause/interrupt never hangs on
a limiter wait. Occupancy and cumulative waits are introspectable live
(`/api/llm-stats` → `limiters`).

---

## 5. Circuit breaker

Per provider (keyed by unique name):

- **closed** — normal traffic.
- **open** — after `circuitThreshold` (5) consecutive failures, or
  immediately on a quota trip. Cooldown: 30 s generic, 10 min quota. While
  open, candidates are skipped in ~0 ms and the chain advances (the skip is
  still recorded in the attempt log as `skipped: "circuit_open"`).
- **half-open** — after the cooldown, one probe request is allowed; success
  closes the breaker, failure re-opens it.

Manual reset: admin Reliability panel → **reset**, or
`PATCH /api/providers/:id { "resetCircuit": true }`.

---

## 6. Context window management

Each provider resolves an effective window:

```
explicit contextWindow column (custom context size)
    └─ else kind hint (OpenAI 128k · Anthropic 200k · Google 1M ·
       DeepSeek 64k · Groq 128k · Ollama/LM Studio/custom 8k …)
```

Budget = `window − maxTokens − 256 safety`. `fitToContext` then:

1. fits as-is when under budget;
2. otherwise drops the **oldest user/assistant pairs** (system instructions
   and the live observation always survive);
3. inserts a visible system marker —
   `[context truncated: N earlier turns omitted…]` — the model is never
   silently amnesiac;
4. if a single message alone overflows (huge observation), hard-truncates its
   **head** (board + status live at the tail) with a character-count marker.

Token estimation is a dependency-free heuristic: CJK ≈ 1 token/char, other
text ≈ 1 token/4 chars, +5/message overhead — sampled every 4th character on
long strings. It is deliberately conservative and used for budgeting, not
billing.

---

## 7. Fallback chains

```
Provider A (role: thinker, priority 10)
   └─ fallbackId → Provider B (any role) 
        └─ fallbackId → Provider C …            (≤ 4 hops, cycle-safe)
             └─ built-in sandbox model          (always last)
```

- The chain follows `fallbackId` links across role boundaries (a reviewer may
  fail over to a thinker's endpoint — availability first).
- Cycles are cut; disabled providers are skipped; deleting a provider clears
  links that pointed at it.
- A call answered by a non-primary provider returns `degraded: true` — shown
  as **RESCUED** in telemetry and stored in the step's sandbox audit.

## 8. Timeouts

- Per-request hard timeout (default 120 s, per provider). For HTTP
  transports it aborts the fetch stream; for the built-in SDK it races the
  promise (the SDK has no signal support).
- The operator's interrupt signal is combined with the timeout controller —
  interrupt always wins over a pending retry backoff or limiter wait.

## 9. Telemetry

One `LlmCall` row per **logical** call (not per attempt):

```
role, provider (who actually answered), model, ok, degraded, attempts,
retries (on primary), rateWaitMs, latencyMs, tokensIn/Out, costUsd,
errorClass, error, detail = full attempt log (JSON, capped 8 KB)
```

- Aggregated by `GET /api/llm-stats?window=3600|86400|604800` → totals
  (success rate, p50/p95, retries, rescues, waits, tokens, spend),
  per-provider rollups, error-class histogram, breaker snapshots, limiter
  occupancy, and the 60 most recent calls.
- Cost: set `costPerMtok` (blended $/1M tokens) on a provider and every
  call it answers is priced by estimated tokens.

## 10. Configuration reference (admin dialog fields)

| Field | Unit | Default | Meaning |
| --- | --- | --- | --- |
| Context window | tokens | 0 = auto by kind | custom context size |
| Rate limit | req/min | 0 = ∞ | client-side RPM ceiling |
| Token limit | tok/min | 0 = ∞ | client-side TPM ceiling |
| Concurrency | parallel | 0 = ∞ | in-flight request cap |
| Timeout | seconds | 120 | per-request hard timeout |
| Max retries | count | 3 | retry budget per request |
| Backoff base | ms | 800 | exponential base (×2, full jitter) |
| Priority | int | 0 | higher wins the role when several are bound |
| Cost | $/Mtok | 0 | blended, for spend tracking |
| Fallback | provider | none | next hop in the chain |

Engine defaults (breaker threshold/cooldowns, safety margin, caps) live in
`ENGINE_DEFAULTS` (`llm/types.ts`).

## 11. Invariants the engine guarantees

1. **Interruption is sacred** — an operator abort stops retries, backoffs,
   limiter waits, and the fallback chain; the result is tagged `aborted`.
2. **No silent amnesia** — any truncation leaves a visible marker for the
   model.
3. **Telemetry never breaks the pipeline** — logging failures are swallowed.
4. **The built-in model is the last resort** — an unconfigured lab still
   runs; a fully dead vendor stack degrades, not dies.
5. **The model under test cannot observe the engine** — retries, waits and
   failovers happen server-side, outside the sandbox projection.
