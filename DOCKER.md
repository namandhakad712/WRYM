# WYRM.LAB — Deployment Guide

Production deployment for the WYRM.LAB agentic puzzle laboratory:
a self-contained Docker image with a persistent SQLite volume.

---

## Quick start

```bash
docker compose up --build
```

The laboratory opens on **http://localhost:3000**.

- The image builds in three stages (deps → build → runtime) on the
  official **Bun / Debian** base. Debian (glibc + OpenSSL) is required
  by Prisma's query engine — Alpine/musl is not supported.
- The app runs as an unprivileged system user (`wyrm`, uid 1001).
- The SQLite database lives on the `wyrm-data` volume: levels, runs,
  steps and telemetry survive container restarts and image upgrades.
- On boot the entrypoint applies the Prisma schema (`prisma db push`)
  to the mounted volume — idempotent, no migration files needed.

## What happens on first boot

1. The schema is applied to `/app/db/custom.db`.
2. The dashboard bootstraps itself: registers the two baseline models
   (`glm-4.6` LLM Thinker, `wyrm-bfs` exhaustive solver), imports the
   12 handcrafted levels of the difficulty ladder (each one BFS-
   certified on first import — expect ~20–40 s of CPU on modest
   hardware), and seeds a demonstration solver run.
3. From there everything is driven from the UI: run agents, launch
   agentic cycles, edit levels in the Forge, configure providers in
   Admin.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:/app/db/custom.db` | SQLite location (keep it on the volume) |
| `PORT` | `3000` | HTTP port |
| `HOSTNAME` | `0.0.0.0` | Bind address |

LLM providers are configured **at runtime** in the Admin tab (any
OpenAI-compatible, Anthropic, Google, OpenRouter, Groq, DeepSeek,
Mistral, xAI, Together, Ollama, LM Studio or custom endpoint). API
keys are stored server-side only and never returned to the browser in
full. With no provider configured, the built-in sandbox model is used.

## HTTPS via Caddy (optional)

```bash
# edit Caddyfile: replace localhost with your domain
docker compose --profile proxy up --build -d
```

Caddy terminates TLS with automatic certificates and proxies to the
app service.

## Operations

```bash
# follow logs
docker compose logs -f wyrm

# back up the laboratory (levels, runs, every recorded thought)
docker run --rm -v wyrm-lab_wyrm-data:/db -v "$PWD":/out alpine \
  tar czf /out/wyrm-backup-$(date +%F).tgz -C /db .

# restore
docker run --rm -v wyrm-lab_wyrm-data:/db -v "$PWD":/in alpine \
  sh -c "cd /db && tar xzf /in/wyrm-backup-YYYY-MM-DD.tgz"

# upgrade to a new version
git pull && docker compose up --build -d
```

## Architecture notes

- **Runtime**: Next.js 16 standalone server executed by Bun.
- **Database**: SQLite via Prisma. One file, one volume — appropriate
  for a single-node laboratory; the schema is portable if you later
  move to Postgres.
- **Determinism**: the game engine is pure — the same level + action
  log always replays identically, so runs recorded in any container
  can be verified by the Checker anywhere else.
- **Health**: `GET /api/models` backs the container healthcheck
  (30 s interval, 40 s start period for first-boot level import).
