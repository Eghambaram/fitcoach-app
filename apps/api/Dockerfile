# FitCoach API image (PROMPT §17.2). Build from the repo root:
#   docker build -f apps/api/Dockerfile .
# On start it migrates (roles, SQL, pg-boss; advisory-locked and idempotent), then serves. A failed
# migration exits the container, so the health check fails and Railway keeps the old deploy (ADR-0043).

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Only the API and the workspace packages it depends on, split into manifests and sources.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune @fitcoach/api --docker

FROM base AS build
# Manifests first so the dependency layer is cached until package.json or the lockfile changes.
COPY --from=prune /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@fitcoach/api \
  && pnpm --filter @fitcoach/api deploy --prod --legacy /app

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 4000
# Listens on '::' (IPv4 + IPv6) for Railway private networking; PORT comes from the environment.
# Needs DATABASE_OWNER_URL, DB_APP_PASSWORD and DB_SYSTEM_PASSWORD for the migration step.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/main.js"]
