# FitCoach web image: Next.js standalone (PROMPT §17.2). Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL=... .
# NEXT_PUBLIC_* are inlined at build time — changing one on Railway needs a rebuild.

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune @fitcoach/web --docker

FROM base AS build
COPY --from=prune /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
# Railway passes service variables with the same name as build args.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_ENV=production
# Optional: enables the Turnstile challenge on the public enquiry form.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_TELEMETRY_DISABLED=1
# No API calls during the build: private networking doesn't exist yet (PROMPT §4.2).
RUN pnpm turbo run build --filter=@fitcoach/web

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=:: \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
