# FitCoach nightly database backup (PROMPT §17.2, ADR-0063). Build from the repo root:
#   docker build -f infra/db-backup/Dockerfile .
# Railway runs it on a cron schedule; it exits when done (restart policy NEVER).

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune @fitcoach/db-backup --docker

FROM base AS build
COPY --from=prune /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@fitcoach/db-backup \
  && pnpm --filter @fitcoach/db-backup deploy --prod --legacy /app

FROM node:24-bookworm-slim AS runner
# pg_dump must be at least the server's major version: match Railway's Postgres (and docker-compose).
ARG PG_MAJOR=17
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
  && apt-get purge -y curl gnupg && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
CMD ["node", "dist/main.js"]
