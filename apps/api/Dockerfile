# FitCoach API image (PROMPT §17.2). Build from the repo root:
#   docker build -f apps/api/Dockerfile .
# Railway runs `node dist/db/migrate.js` in this image as the pre-deploy command, then `node dist/main.js`.

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
CMD ["node", "dist/main.js"]
