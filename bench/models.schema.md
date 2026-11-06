# `bench/models.json` — benchmark entrant roster (format v1)

One row per arena entrant. **API keys are NEVER stored here** — each model
names an *environment variable* (`apiKeyEnv`) that must be exported before
`bun scripts/run-benchmark.ts` runs. The secret scanner in CI enforces this.

## Top level

| field | type | meaning |
|---|---|---|
| `$schema` | string | points at this document |
| `version` | number | roster format version (currently 1) |
| `comment` | string | human note (ignored) |
| `defaults` | object | run defaults shared by every model |
| `models` | array | the entrants (below) |

## Model row

| field | type | required | meaning |
|---|---|---|---|
| `key` | string | ✓ | unique arena id (also the folder name under `results/runs/`) |
| `name` | string | ✓ | display name on the leaderboard |
| `kind` | string | ✓ | a `ProviderKind` from `src/lib/wyrm/llm/types.ts` or `solver` |
| `modelId` | string | ✓ for API kinds | vendor model id forwarded verbatim |
| `baseUrl` | string | — | override the kind's default base URL |
| `apiKeyEnv` | string | ✓ for keyed kinds | env var holding the key (never the key itself) |
| `aaUrl` | string | — | Artificial Analysis page for this model (verified links only) |
| `fallback` | string | — | another `key`: fail over to it when this provider dies |
| `note` | string | — | leaderboard footnote |
| `enabled` | boolean | ✓ | `false` = listed but skipped by runs & site export |

### Resilience knobs (all optional; `0`/absent ⇒ engine default)

| field | meaning |
|---|---|
| `contextWindow` | context size in tokens (drives the context fitter) |
| `rpm` / `tpm` | client-side rate limiter ceilings |
| `concurrency` | max parallel in-flight requests |
| `timeoutMs` | per-request hard timeout |
| `maxRetries` / `retryBaseMs` | retry budget & exponential backoff base |
| `costPerMtok` | blended USD per 1M tokens (cost telemetry; `0` = free) |

### Valid `kind` values

`zai` (built-in sandbox) · `openai` · `anthropic` · `google` · `openrouter` ·
`groq` · `deepseek` · `mistral` · `xai` · `together` · `moonshot` (Kimi
K-series, 1M ctx) · `minimax` (M-series, 1M ctx) · `dashscope` (Alibaba
Qwen) · `zhipu` (Z.ai/Zhipu, free GLM Flash) · `piapi` (aggregator bundle) ·
`nvidia` (NIM) · `cloudflare` (Workers AI) · `cohere` · `siliconflow` ·
`ollama` (local) · `lmstudio` (local) · `mcp` (any MCP server) · `custom`
(any OpenAI-compatible endpoint) · `solver` (the deterministic BFS baseline —
no API, no cost)

## Adding an entrant (the 60-second version)

1. Pick a provider from `docs/FREE_PROVIDERS.md` (free tiers, no card) or any
   OpenAI-compatible endpoint.
2. Add a row here with `enabled: false` (so nothing breaks before you set the key).
3. `export <apiKeyEnv>=…` and enable the row.
4. `bun scripts/run-benchmark.ts --models <key>` — commit `results/`, push;
   CI re-certifies and the site re-renders.

`tests/models.test.ts` guards every invariant on this file in CI.
