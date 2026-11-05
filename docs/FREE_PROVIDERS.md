# WRYM · Free LLM Provider Research — Verified November 2026

**Question:** which LLM APIs offer a *genuine, permanent free tier* with **no
credit card required**, good enough to run this benchmark?

**Method:** provider signup/docs pages opened directly; cross-checked against
two independent comparisons — OpenRouter's "Free LLM API in 2026: 13 Options
Ranked and Compared" and the `awesome-free-models` list (last checked
2026-10-29). Every claim below was verified on **5 November 2026**. The
quick-reference rendering of this doc is the
[Providers page](https://namandhakad712.github.io/WRYM/providers.html) on the
docs site.

## The lineup (no credit card, permanent free tier)

| provider | free tier | limits | WRYM hookup (`bench/models.json`) |
|---|---|---|---|
| **Google AI Studio** | Gemini Flash / Flash-Lite family (~15 models), multimodal, 1M context — the most generous free tier anywhere | up to ~1,500 req/day (model-dependent), 5–15 rpm | `{"kind":"google","modelId":"gemini-2.5-flash","apiKeyEnv":"GEMINI_API_KEY"}` |
| **Groq** | 12 models — Llama 3.x/4, Qwen, GPT-OSS, Whisper on LPU | ~30 rpm class, ~14.4k req/day class | `{"kind":"groq","modelId":"llama-3.3-70b-versatile","apiKeyEnv":"GROQ_API_KEY"}` |
| **Cerebras** | fastest tokens/sec (wafer-scale) | daily token allowance (~1M tok/day class) | `{"kind":"custom","baseUrl":"https://api.cerebras.ai/v1","apiKeyEnv":"CEREBRAS_API_KEY"}` |
| **OpenRouter** | ~21 `:free` models through one key (DeepSeek, Llama, Qwen, GLM…) | per-model daily caps; account needs a (possibly $0) credit balance | `{"kind":"openrouter","modelId":"deepseek/deepseek-chat-v3-0324:free","apiKeyEnv":"OPENROUTER_API_KEY"}` |
| **Mistral La Plateforme** | Experiment tier ≈ **1B tokens/month** | 1 req/s, 500k tok/min; phone verification; data opt-in | `{"kind":"mistral","modelId":"mistral-small-latest","apiKeyEnv":"MISTRAL_API_KEY"}` |
| **Cloudflare Workers AI** | 50+ open models at the edge | 10,000 neurons/day | `{"kind":"custom","baseUrl":"https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1","apiKeyEnv":"CLOUDFLARE_API_TOKEN"}` |
| **NVIDIA NIM** (build.nvidia.com) | 100+ accelerated open models | ~40 rpm class, per-model daily caps | `{"kind":"custom","baseUrl":"https://integrate.api.nvidia.com/v1","apiKeyEnv":"NVIDIA_API_KEY"}` |
| **Cohere** | trial key, Command R family | 20 rpm, 1,000 req/month, **non-commercial** | `{"kind":"custom","baseUrl":"https://api.cohere.ai/compatibility/v1","apiKeyEnv":"COHERE_API_KEY"}` |
| **SiliconFlow** | 15+ open-weight models at ¥0 (Qwen, GLM, DeepSeek) | per-model daily token caps | `{"kind":"custom","baseUrl":"https://api.siliconflow.cn/v1","apiKeyEnv":"SILICONFLOW_API_KEY"}` |
| **AnyAPI** | 400+ models, 15 free, unlimited users per key | 100k tokens/day | `{"kind":"custom","baseUrl":"https://api.anyapi.io/v1","apiKeyEnv":"ANYAPI_API_KEY"}` |
| **Ollama (local)** | unlimited, offline, private | your VRAM | `{"kind":"ollama","baseUrl":"http://localhost:11434/v1"}` |

Caveats worth knowing: Google's free tier is **Flash/Flash-Lite only** (Pro
needs billing; Gemini 2.0 Flash was shut down Jun 2026) and data may train
models outside EU/UK/EEA unless opted out. Mistral's Experiment tier trades
your data for the huge allowance. OpenRouter's free lineup churns constantly.

## Researched and excluded

| provider | status | why |
|---|---|---|
| **GitHub Models** | **retired 30 Jul 2026** | playground, catalog, inference API and BYOK all shut down (confirmed on docs.github.com/en/github-models). Successors: Azure AI Foundry / GitHub Copilot |
| **SambaNova** | card required | free tier exists but asks payment details at signup |
| **Hugging Face Inference** | unusable | ≈ $0.10/month of inference credit on free accounts ($2 for PRO) |
| **DeepSeek platform** | starter credit | 5M tokens once at signup, then pay-per-token |
| **Together / DeepInfra / Fireworks** | paid | excellent hosts, but minimum purchase / no permanent free models |

## Running the benchmark on a free tier

```bash
# 1. pick a provider, get a key at its console (links on the Providers page)
export GROQ_API_KEY=gsk_...

# 2. enable the entry in bench/models.json (pre-configured, rate-limit aware)
#    e.g. the "llama-3.3-70b" entry — rpm already set below Groq's ceiling

# 3. run
bun scripts/run-benchmark.ts --models llama-3.3-70b

# 4. commit results/ and push — CI re-certifies, the site re-renders
```

The arena's reliability layer (rate limiter, Retry-After-aware retries,
fallback chains to the built-in sandbox model) is designed to live inside
free-tier ceilings; every wait is recorded honestly in the run's reliability
ledger.

## Sources

- OpenRouter, *Free LLM API in 2026: 13 Options Ranked and Compared* — https://openrouter.ai/blog/tutorials/free-llm-apis-compared
- awesome-free-models (checked 2026-10-29) — https://github.com/12britz/awesome-free-models
- GitHub Models retirement — https://docs.github.com/en/github-models
- Provider consoles/docs: aistudio.google.com · console.groq.com · cloud.cerebras.ai · openrouter.ai · console.mistral.ai · developers.cloudflare.com/workers-ai · build.nvidia.com · dashboard.cohere.com · siliconflow.cn · ollama.com

All opened and verified 5 Nov 2026.
