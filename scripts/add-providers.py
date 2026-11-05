#!/usr/bin/env python3
"""v7 · expand bench/models.json with the researched provider bundle.
Verified sources (Nov 2026): docs.z.ai, piapi.ai/docs, itsfree.ai (NIM/Cloudflare),
OpenRouter blog, Groq/KDnuggets. One-off migration — removed after commit."""
import json

P = "bench/models.json"
d = json.load(open(P))
models = d["models"]

def find(key):
    return next(m for m in models if m["key"] == key)

# ── refresh openrouter-free with the current verified limits ──────────
find("openrouter-free")["note"] = (
    "Any :free model on OpenRouter — one key, ~25 free models. Free accounts: "
    "20 rpm / 50 requests/day (1,000/day once you ever bought $10 credit). Swap modelId freely."
)

NEW = [
    # ── Z.ai / Zhipu — permanent FREE GLM Flash tier (email-only signup) ──
    {
        "key": "glm-4.7-flash",
        "name": "GLM-4.7-Flash (free)",
        "kind": "zhipu",
        "modelId": "glm-4.7-flash",
        "apiKeyEnv": "ZHIPU_API_KEY",
        "aaUrl": "https://artificialanalysis.ai/models/glm-4-7-flash",
        "costPerMtok": 0,
        "contextWindow": 200000,
        "rpm": 8,
        "concurrency": 1,
        "timeoutMs": 60000,
        "maxRetries": 6,
        "fallback": "glm-4.6",
        "note": "PERMANENT FREE tier on z.ai (email-only signup, no card) and open.bigmodel.cn. OpenAI-compatible at api.z.ai/api/paas/v4. The strongest zero-cost entrant in the arena.",
        "enabled": False,
    },
    {
        "key": "glm-4.5-flash",
        "name": "GLM-4.5-Flash (free)",
        "kind": "zhipu",
        "modelId": "glm-4.5-flash",
        "apiKeyEnv": "ZHIPU_API_KEY",
        "costPerMtok": 0,
        "contextWindow": 128000,
        "rpm": 8,
        "concurrency": 1,
        "timeoutMs": 60000,
        "maxRetries": 6,
        "fallback": "glm-4.6",
        "note": "Second free GLM Flash line — different character than 4.7-flash, same zero cost.",
        "enabled": False,
    },
    # ── PiAPI bundle — one key, frontier models at 10–75% of list ──────
    {
        "key": "piapi-gpt-5.2",
        "name": "GPT-5.2 (PiAPI bundle)",
        "kind": "piapi",
        "modelId": "gpt-5.2",
        "apiKeyEnv": "PIAPI_API_KEY",
        "aaUrl": "https://artificialanalysis.ai/models/gpt-5-2",
        "contextWindow": 400000,
        "rpm": 60,
        "concurrency": 2,
        "fallback": "glm-4.6",
        "note": "PiAPI aggregator: GPT-5.2 at 50% of OpenAI list price, OpenAI-compatible, one key for the whole bundle (Claude/DeepSeek/Gemini too).",
        "enabled": False,
    },
    {
        "key": "piapi-claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6 (PiAPI bundle)",
        "kind": "piapi",
        "modelId": "claude-sonnet-4-6",
        "apiKeyEnv": "PIAPI_API_KEY",
        "contextWindow": 200000,
        "rpm": 60,
        "concurrency": 2,
        "fallback": "glm-4.6",
        "note": "Claude Sonnet 4.6 via PiAPI at 75% of Anthropic list price — the bundle's reasoning specialist.",
        "enabled": False,
    },
    # ── Groq free tier: GPT-OSS-120B ────────────────────────────────────
    {
        "key": "gpt-oss-120b",
        "name": "GPT-OSS-120B (Groq free)",
        "kind": "groq",
        "modelId": "openai/gpt-oss-120b",
        "apiKeyEnv": "GROQ_API_KEY",
        "aaUrl": "https://artificialanalysis.ai/models/gpt-oss-120b",
        "costPerMtok": 0,
        "contextWindow": 128000,
        "rpm": 20,
        "tpm": 12000,
        "concurrency": 1,
        "timeoutMs": 45000,
        "maxRetries": 5,
        "fallback": "glm-4.6",
        "note": "OpenAI's open-weight 120B on Groq's LPU free tier — frontier-adjacent, zero cost.",
        "enabled": False,
    },
    # ── NVIDIA NIM — 80+ open models, evaluation endpoint ──────────────
    {
        "key": "nemotron-3-ultra",
        "name": "Nemotron 3 Ultra (NVIDIA NIM)",
        "kind": "nvidia",
        "modelId": "nvidia/nemotron-3-ultra-550b-a55b",
        "apiKeyEnv": "NVIDIA_API_KEY",
        "costPerMtok": 0,
        "contextWindow": 128000,
        "rpm": 30,
        "concurrency": 2,
        "timeoutMs": 90000,
        "maxRetries": 5,
        "fallback": "glm-4.6",
        "note": "build.nvidia.com free evaluation endpoint: 82 open models, phone verification, no card, up to 40 rpm. Also hosts gpt-oss-120b, Kimi K3, DeepSeek V4 Flash.",
        "enabled": False,
    },
    # ── Cloudflare Workers AI — neurons at the edge ─────────────────────
    {
        "key": "cloudflare-llama-3.3-70b",
        "name": "Llama 3.3 70B (Cloudflare free)",
        "kind": "cloudflare",
        "modelId": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "baseUrl": "https://api.cloudflare.com/client/v4/accounts/REPLACE_ACCOUNT_ID/ai/v1",
        "apiKeyEnv": "CLOUDFLARE_API_TOKEN",
        "costPerMtok": 0,
        "contextWindow": 16384,
        "rpm": 20,
        "concurrency": 1,
        "timeoutMs": 60000,
        "maxRetries": 5,
        "fallback": "glm-4.6",
        "note": "Workers AI free allowance: 10,000 neurons/day. Replace REPLACE_ACCOUNT_ID in baseUrl with your Cloudflare account id. Edge catalogue also carries gpt-oss-120b and glm-4.7-flash.",
        "enabled": False,
    },
    # ── Cohere trial keys ───────────────────────────────────────────────
    {
        "key": "cohere-command-r-plus",
        "name": "Command R+ (Cohere trial)",
        "kind": "cohere",
        "modelId": "command-r-plus-08-2024",
        "apiKeyEnv": "COHERE_API_KEY",
        "costPerMtok": 0,
        "contextWindow": 128000,
        "rpm": 15,
        "concurrency": 1,
        "timeoutMs": 60000,
        "maxRetries": 4,
        "fallback": "glm-4.6",
        "note": "Cohere trial key: 20 rpm, 1,000 requests/month, non-commercial. Compatibility endpoint is OpenAI-shaped.",
        "enabled": False,
    },
    # ── SiliconFlow — ¥0 open-weight lineup ─────────────────────────────
    {
        "key": "siliconflow-qwen-7b",
        "name": "Qwen 2.5 7B (SiliconFlow ¥0)",
        "kind": "siliconflow",
        "modelId": "Qwen/Qwen2.5-7B-Instruct",
        "apiKeyEnv": "SILICONFLOW_API_KEY",
        "costPerMtok": 0,
        "contextWindow": 32768,
        "rpm": 15,
        "concurrency": 1,
        "timeoutMs": 60000,
        "maxRetries": 4,
        "fallback": "glm-4.6",
        "note": "SiliconFlow's ¥0 open-weight tier (Qwen/GLM/DeepSeek rotate through it). Small-context stress test for the context fitter.",
        "enabled": False,
    },
    # ── OpenRouter auto-routing free model ─────────────────────────────
    {
        "key": "openrouter-auto-free",
        "name": "OpenRouter auto-free",
        "kind": "openrouter",
        "modelId": "openrouter/free",
        "apiKeyEnv": "OPENROUTER_API_KEY",
        "costPerMtok": 0,
        "contextWindow": 128000,
        "rpm": 15,
        "concurrency": 1,
        "timeoutMs": 90000,
        "maxRetries": 5,
        "fallback": "glm-4.6",
        "note": "OpenRouter's auto-router: names the best currently-available free model for the request — the arena's rolling dice entrant.",
        "enabled": False,
    },
]

# insert after anchor keys, preserving a readable order
anchors = {
    "glm-4.7-flash": "glm-4.6",
    "glm-4.5-flash": "glm-4.7-flash",
    "piapi-gpt-5.2": "claude-sonnet-4-5",
    "piapi-claude-sonnet-4.6": "piapi-gpt-5.2",
    "gpt-oss-120b": "llama-3.3-70b",
    "nemotron-3-ultra": "gpt-oss-120b",
    "cloudflare-llama-3.3-70b": "mistral-small",
    "cohere-command-r-plus": "cloudflare-llama-3.3-70b",
    "siliconflow-qwen-7b": "cohere-command-r-plus",
    "openrouter-auto-free": "openrouter-free",
}
by_key = {m["key"]: m for m in NEW}
for key in NEW:  # top-down: each entry's anchor is already in place
    m = by_key[key["key"]]
    anchor = anchors[key["key"]]
    idx = next(i for i, x in enumerate(models) if x["key"] == anchor)
    models.insert(idx + 1, m)

d["models"] = models
json.dump(d, open(P, "w"), indent=2, ensure_ascii=True)
open(P, "a").write("\n")

print(f"OK — {len(models)} models, kinds:", sorted({m['kind'] for m in models}))
