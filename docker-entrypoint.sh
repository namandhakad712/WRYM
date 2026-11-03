#!/bin/sh
# ── WYRM.LAB · container entrypoint ─────────────────────────────────
# 1. apply the Prisma schema to the mounted volume (idempotent)
# 2. hand off to the standalone Next.js server
set -e

echo "[wyrm] applying database schema to \${DATABASE_URL:-file:/app/db/custom.db} …"
bunx prisma db push --skip-generate --accept-data-loss 2>/dev/null \
  || bunx prisma db push --skip-generate

echo "[wyrm] starting WYRM.LAB on \${PORT:-3000} …"
exec bun server.js
