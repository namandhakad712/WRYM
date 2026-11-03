# ── WYRM.LAB · production image ─────────────────────────────────────
# Multi-stage build on the official Bun Debian image (Prisma's query
# engine needs glibc + OpenSSL; alpine/musl is not supported).
#
#   docker build -t wyrm-lab .
#   docker compose up
#
# The app ships as a Next.js standalone server; the SQLite database
# lives on a mounted volume so runs, levels and telemetry survive
# container restarts and upgrades.

# ── stage 1 · dependencies ───────────────────────────────────────────
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── stage 2 · build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at runtime; a throwaway path keeps the
# build hermetic. Prisma client generation needs no live database.
ENV DATABASE_URL=file:/tmp/build.db
RUN bunx prisma generate \
 && bun run build \
 && mkdir -p /app/db

# ── stage 3 · runtime ────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/db/custom.db

# openssl is required by Prisma engines on Debian bookworm
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 wyrm

COPY --from=build --chown=wyrm:wyrm /app/.next/standalone ./
COPY --from=build --chown=wyrm:wyrm /app/.next/static ./.next/static
COPY --from=build --chown=wyrm:wyrm /app/public ./public
COPY --from=build --chown=wyrm:wyrm /app/prisma ./prisma
# Prisma query engines are loaded dynamically and can escape Next's
# output tracing — ship them explicitly.
COPY --from=build --chown=wyrm:wyrm /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=wyrm:wyrm /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=wyrm:wyrm docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
 && mkdir -p /app/db && chown -R wyrm:wyrm /app/db

USER wyrm
EXPOSE 3000
VOLUME ["/app/db"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/models').then(r=>{if(!r.ok)throw 0}).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
