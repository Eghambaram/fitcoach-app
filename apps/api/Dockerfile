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
# pg_dump / pg_restore for the in-API nightly backup (ADR-0064). Must be at least the server's major
# version: keep PG_MAJOR equal to Railway's Postgres (and docker-compose, infra/db-backup).
ARG PG_MAJOR=17
RUN apt-get update   && apt-get install -y --no-install-recommends ca-certificates curl gnupg   && install -d /usr/share/postgresql-common/pgdg   && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc     -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc   && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main"     > /etc/apt/sources.list.d/pgdg.list   && apt-get update   && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}"   && apt-get purge -y curl gnupg && apt-get autoremove -y   && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 4000
# Listens on '::' (IPv4 + IPv6) for Railway private networking; PORT comes from the environment.
# Needs DATABASE_OWNER_URL, DB_APP_PASSWORD and DB_SYSTEM_PASSWORD for the migration step.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/main.js"]
