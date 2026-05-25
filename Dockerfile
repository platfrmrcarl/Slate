# syntax=docker/dockerfile:1.7

# ---- Dependencies stage ----
FROM node:22-slim AS deps
WORKDIR /app
ENV PNPM_STORE_DIR=/pnpm-store
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy workspace package manifests so pnpm install resolves their deps too;
# without these, Next.js build's typecheck can't find CLI-only deps (commander).
COPY packages/cli/package.json packages/cli/
# Cache mount lets pnpm reuse downloaded tarballs across builds when lockfile
# changes. When the lockfile is unchanged the whole layer is hit instead, so
# this only helps on dep churn.
RUN --mount=type=cache,target=/pnpm-store,sharing=locked \
    pnpm install --frozen-lockfile

# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder env values purely to satisfy the Zod env() validation that
# Next.js page-data collection runs at build time. Real values are injected
# at runtime by the Cloud Run service config (secrets + envFrom).
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-only-build-time-only-build-time-only-build-time- \
    APP_URL=https://build.example.com \
    PREVIEW_TOKEN_SECRET=build-time-only-build-time-only-build-time-only-build \
    INTERNAL_JOB_SECRET=build-time-only-build-time-only-build-time-only-build \
    GCS_BUCKET_MEDIA=slate-build-placeholder
# .next/cache holds webpack module + swc transform cache. Persisting it across
# builds turns most `pnpm build` runs into incremental compiles.
RUN --mount=type=cache,target=/app/.next/cache,sharing=locked \
    pnpm build
RUN pnpm prune --prod

# ---- Runtime stage (Cloud Run service) ----
FROM gcr.io/distroless/nodejs22-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV OTEL_ENABLED=true
ENV OTEL_NODE_RESOURCE_DETECTORS=env,host,os,process
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
USER 1000:1000
CMD ["server.js"]

# ---- Migration stage (Cloud Run Job) ----
# Distroless doesn't ship pg_dump, so the migration job uses node:22-slim with
# the postgres client installed for backup/restore tooling. drizzle-kit is run
# from the pre-built node_modules tree to keep the image small-ish.
FROM node:22-slim AS migration
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY --from=build /app ./
CMD ["pnpm", "db:migrate"]
