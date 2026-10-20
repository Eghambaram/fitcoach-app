# Railway deployment — staging

How FitCoach runs on Railway (PROMPT §17.1–§17.6) and how to set up the **staging** environment step by step. Production follows the same shape in step 6.2. File storage is Cloudflare R2: set it up first with [r2.md](r2.md), because the API needs the R2 values.

## What runs where

```
Railway project "fitcoach" → environment "staging"
├── web       Next.js standalone (apps/web/Dockerfile) — the only public domain
├── api       NestJS (apps/api/Dockerfile) — private network only; migrations run before each deploy
└── Postgres  Railway PostgreSQL (volume, backups enabled)

Cloudflare R2 (outside Railway): fitcoach-staging-private, fitcoach-staging-public
```

- Browsers only talk to **web**. Web forwards `/api/*` to the API over Railway's private network (`api.railway.internal`). The API has **no public domain**.
- Both services listen on `::` (IPv4 + IPv6), which private networking needs.
- Each service builds from the **repo root** with its own Dockerfile and config file (`apps/api/railway.json`, `apps/web/railway.json`). `watchPatterns` mean a web-only change doesn't redeploy the API.
- The API container **migrates on start** (`node dist/db/migrate.js`, then the server). This creates the database roles, applies SQL migrations and installs the pg-boss schema, under an advisory lock and idempotently. If it fails, the container exits, the health check never passes, and the previous deploy keeps serving (ADR-0043).
- Deploy health checks: API `GET /v1/health` (no DB), web `GET /healthz`. Full readiness (DB + jobs + R2) is `GET /api/v1/health/ready` on the web domain.
- The nightly `pg_dump` service (`db-backup`) arrives in step 6.2.

## Before you start

- A Railway account on the **Hobby** plan or higher (three services).
- The GitHub repository `Eghambaram/fitcoach-app`, with the Railway GitHub app allowed to access it (Railway asks the first time you deploy from GitHub).
- The R2 values from [r2.md](r2.md): account ID, access key ID, secret access key and the staging public bucket URL.
- An email provider (see [Email on staging](#email-on-staging)).
- Node.js on your machine, to generate secrets.

### Generate the secrets

Run this four times and keep each value for the table below. Hex is URL-safe, which matters because two of the values go inside database URLs.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You need: `DB_APP_PASSWORD`, `DB_SYSTEM_PASSWORD`, `SESSION_SECRET`, `IP_HASH_SALT`. Use different values in each environment, and never reuse local `.env` values.

## Step by step

Ready-to-paste variable files with placeholders: [`infra/railway/staging/api.env.example`](../../infra/railway/staging/api.env.example) (replace every `<PLACEHOLDER>`), [`web.env.example`](../../infra/railway/staging/web.env.example) (paste as is) and [`github.env.example`](../../infra/railway/staging/github.env.example) (the smoke-test repository variable). Paste the filled-in values into Railway and GitHub only. Never commit them.

### 1. Project and environment

1. Railway dashboard → **New Project** → **Empty Project**. Rename it `fitcoach` (Settings → General).
2. A new project starts with an environment called `production`. Leave it empty until step 6.2.
3. Settings → **Environments** → **New Environment** → name it `staging` → **Empty environment**.
4. Switch to `staging` with the environment picker at the top of the canvas. Do everything below in `staging`.

### 2. Postgres

1. **+ Create** → **Database** → **PostgreSQL**. Keep the service name `Postgres`, because the variable references below use it.
2. Note the Postgres major version (Postgres service → Settings → Source image, e.g. `…/postgres-ssl:17`). If it isn't 17, tell Claude: local Postgres must match it (ADR-0027).
3. Postgres service → **Backups** → enable scheduled backups (daily + weekly).
4. Don't add a public TCP proxy. Only the API connects, over the private network.

### 3. API service

1. **+ Create** → **GitHub Repo** → `Eghambaram/fitcoach-app`.
2. Rename the service to exactly **`api`** (Settings → service name). The web variables reference `api`.
3. Settings → **Source**: branch `main`, root directory empty (the repo root), and turn on **Wait for CI**. Staging then deploys only after GitHub Actions passes on `main`.
4. Settings → **Config-as-code** → Railway config file: `/apps/api/railway.json` (watch patterns, health check, restart policy). Railway may ignore this file. On staging it did, so also set these directly:
   - **Deploy** → **Healthcheck Path** `/v1/health`, timeout `120`. **Restart Policy** On Failure, `5`.
   - **Deploy** → **Custom Start Command** and **Pre-deploy Command**: leave **empty**. The image's own command migrates, then starts the API (ADR-0043). A custom start command would skip the migration.
   - **Build** → **Watch Paths** (optional): `apps/api/**`, `packages/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`.
5. Settings → **Networking**: don't generate a public domain. The private domain `api.railway.internal` is enough.
6. **Variables** → **Raw Editor** → paste this, then replace each `<…>`. `RAILWAY_DOCKERFILE_PATH` makes Railway build the Dockerfile instead of guessing with Railpack:

```env
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
APP_ENV=staging
PORT=4000
LOG_LEVEL=info
WEB_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}

DATABASE_OWNER_URL=${{Postgres.DATABASE_URL}}
DB_APP_PASSWORD=<generated hex>
DB_SYSTEM_PASSWORD=<generated hex>
DATABASE_URL=postgresql://fitcoach_app:${{DB_APP_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DATABASE_SYSTEM_URL=postgresql://fitcoach_system:${{DB_SYSTEM_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DB_POOL_MAX=10

SESSION_SECRET=<generated hex>
IP_HASH_SALT=<generated hex>

SIGNUP_MODE=invite_code
BETA_DEFAULT_CLIENT_LIMIT=50

EMAIL_PROVIDER=resend
RESEND_API_KEY=<re_… from Resend>
EMAIL_FROM=FitCoach Staging <onboarding@resend.dev>

STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<staging R2 token access key id>
STORAGE_SECRET_ACCESS_KEY=<staging R2 token secret>
STORAGE_PRIVATE_BUCKET=fitcoach-staging-private
STORAGE_PUBLIC_BUCKET=fitcoach-staging-public
STORAGE_PUBLIC_BASE_URL=https://pub-<id>.r2.dev
STORAGE_KEY_PREFIX=
STORAGE_BUDGET_BYTES=8589934592
STORAGE_HARD_LIMIT_BYTES=9663676416
```

`web` doesn't exist yet, so `${{web.RAILWAY_PUBLIC_DOMAIN}}` stays unresolved for now. Deploy after step 4.

### 4. Web service

1. **+ Create** → **GitHub Repo** → `Eghambaram/fitcoach-app` again.
2. Rename the service to exactly **`web`**.
3. Settings → **Source**: branch `main`, root directory empty, **Wait for CI** on.
4. Settings → **Config-as-code** → `/apps/web/railway.json`. As for the API, also set **Deploy** → **Healthcheck Path** `/healthz` (timeout `60`) and **Restart Policy** On Failure, `5`. Leave **Custom Start Command** empty; the image runs `node apps/web/server.js`.
5. **Variables** → **Raw Editor**:

```env
RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
NEXT_PUBLIC_SITE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_APP_ENV=staging
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
HOSTNAME=::
PORT=3000
```

6. Settings → **Networking** → **Generate Domain**, target port **3000**. You get something like `web-staging-ab12.up.railway.app`.

`NEXT_PUBLIC_*` are inlined at **build** time: after changing one, redeploy web so it rebuilds. The staging build shows a "Staging environment — test data only" ribbon.

### 5. First deploy

1. Click **Deploy** (or **Apply changes**) for the staged changes.
2. Watch **api → Deployments → the latest**. The **build log** shows Docker steps (`[prune …] RUN pnpm dlx turbo@… prune`), not `railpack`. Right after `Starting Container`, the **deploy log** prints `[migrate] bootstrapping roles … applying SQL migrations … installing pg-boss schema … done`, then the API starts.
3. When both services are green, open `https://<web domain>/api/v1/health/ready`. Expected: `{"status":"ok","checks":{"database":{"status":"ok"…},"jobs":{"status":"ok"…},"storage":{"status":"ok"…}}}`.

### 6. Beta invite code for staging

Signup needs an invite code (`SIGNUP_MODE=invite_code`). The CLIs are compiled into the API image, so run them inside the API service with the Railway CLI:

```bash
npm install -g @railway/cli
railway login
railway link                 # pick the fitcoach project, environment staging
railway ssh --service api
# inside the container:
node dist/cli/beta-invite.js create --uses 10 --days 30 --label "staging"
node dist/cli/beta-invite.js list
```

The code is printed once. Only its hash is stored. Creation is audited.

### 7. GitHub: post-deploy smoke tests

`.github/workflows/staging-smoke.yml` runs after each successful Railway staging deploy (Railway reports deploys to GitHub as deployments). It checks `/healthz`, waits for `/api/v1/health/ready` to report `ok`, then runs `e2e/smoke.spec.ts` against staging.

1. GitHub → repository → Settings → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**: `STAGING_WEB_URL` = `https://<web domain>` (no trailing slash).
2. To run it by hand: Actions → **Staging smoke** → **Run workflow**.

### 8. Check it end to end

1. Open the web domain, choose **Create account**, and sign up with the invite code and your own email.
2. Confirm the email from your inbox, then log in.
3. Settings → **Profile** → upload a photo. It appears in the app shell. Cloudflare → R2 → `fitcoach-staging-public` → `trainer-avatars/<workspace id>/<uuid>.webp` (plus `_thumb.webp`).

## Variables reference (PROMPT §17.3)

| Variable                                            | Service | Staging value                                                                                                                                  |
| --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                           | api     | `staging` (Secure cookies, https `WEB_ORIGIN` and a 32+ character `IP_HASH_SALT` are enforced)                                                 |
| `PORT`                                              | api     | `4000` — set explicitly so `${{api.PORT}}` resolves for web                                                                                    |
| `WEB_ORIGIN`                                        | api     | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` — exact origin for CSRF checks and email links                                                        |
| `DATABASE_OWNER_URL`                                | api     | `${{Postgres.DATABASE_URL}}` — admin URL, used only by the start-up migration                                                                  |
| `DB_APP_PASSWORD` / `DB_SYSTEM_PASSWORD`            | api     | generated hex; the migration sets these as the role passwords on every deploy                                                                  |
| `DATABASE_URL`                                      | api     | `postgresql://fitcoach_app:${{DB_APP_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}` (RLS-enforced role)        |
| `DATABASE_SYSTEM_URL`                               | api     | same with `fitcoach_system` and `${{DB_SYSTEM_PASSWORD}}` (jobs, auth lookups, CLIs)                                                           |
| `DB_POOL_MAX`                                       | api     | `10` per replica; keep replicas × pools well under Postgres `max_connections`                                                                  |
| `SESSION_SECRET` / `IP_HASH_SALT`                   | api     | generated hex (32 bytes each)                                                                                                                  |
| `SIGNUP_MODE` / `BETA_DEFAULT_CLIENT_LIMIT`         | api     | `invite_code` / `50`                                                                                                                           |
| `EMAIL_PROVIDER` + `RESEND_API_KEY` or `SMTP_URL`   | api     | see [Email on staging](#email-on-staging); `console` is allowed on staging but you won't receive links                                         |
| `EMAIL_FROM`                                        | api     | `FitCoach Staging <onboarding@resend.dev>` (or an address on your verified domain)                                                             |
| `STORAGE_*`                                         | api     | from [r2.md](r2.md); `STORAGE_REGION=auto`, `STORAGE_KEY_PREFIX` empty (`pr-<n>/` only for PR environments)                                    |
| `STORAGE_BUDGET_BYTES` / `STORAGE_HARD_LIMIT_BYTES` | api     | `8589934592` / `9663676416` — shared with production, because the R2 free tier is per account                                                  |
| `LOG_LEVEL`                                         | api     | `info`                                                                                                                                         |
| `NEXT_PUBLIC_SITE_URL`                              | web     | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (build time)                                                                                              |
| `NEXT_PUBLIC_APP_ENV`                               | web     | `staging` (build time; shows the staging ribbon)                                                                                               |
| `API_INTERNAL_URL`                                  | web     | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`                                                                                         |
| `HOSTNAME` / `PORT`                                 | web     | `::` / `3000`                                                                                                                                  |
| later                                               | —       | `APP_ENCRYPTION_KEY` (platform MFA, step 6.1), `BACKUP_HEARTBEAT_TOKEN` (db-backup, 6.2); Razorpay and Google variables are v1.1 — leave unset |

## Email on staging

Signup and password reset send real emails, so staging needs a working provider:

- **Resend (recommended).** Create an account at resend.com → API Keys → create a key with "Sending access". Until you verify a domain, Resend only sends from `onboarding@resend.dev` **to your own Resend account email**. That's enough to test signup yourself. To let other testers sign up on staging, verify a domain (Resend → Domains) and set `EMAIL_FROM` to an address on it.
- **Any SMTP provider.** `EMAIL_PROVIDER=smtp` and `SMTP_URL=smtps://<user>:<password>@<host>:465` (URL-encode special characters in the password).

## Deploy flow (PROMPT §17.4)

1. **Pull request:** GitHub Actions `CI` runs format, typecheck, lint, unit, DB/RLS and API integration tests (Testcontainers) and the build, then builds both Docker images and runs Playwright against them (`docker compose --profile full`).
2. **Merge to `main`:** once CI is green, Railway builds and deploys staging ("Wait for CI"). The new API container migrates before it serves. Then `Staging smoke` runs against the live URL.
3. **Production** (step 6.2) will track a `production` branch fast-forwarded from `main` after staging smoke passes.

Migrations must stay backward-compatible with the running release (expand → migrate → contract), so redeploying the previous version is always a safe rollback.

## Rollback

Service → **Deployments** → pick the last good deployment → **⋮** → **Redeploy**. Database migrations aren't rolled back. They're written to be compatible with the previous release.

## Troubleshooting (PROMPT §17.6)

| Symptom                                                                                       | Likely cause                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api` calls return 502 "FitCoach is temporarily unavailable"                                 | `API_INTERNAL_URL` wrong, API `PORT` not set, API service not named `api`, or the API crashed (check its deploy logs).                                                                                                                                                          |
| Build log says `railpack` / "No start command detected"                                       | Railway isn't using the Dockerfile. Set the service variable `RAILWAY_DOCKERFILE_PATH` (`apps/api/Dockerfile` or `apps/web/Dockerfile`) and deploy the latest commit.                                                                                                           |
| Deploy log shows `[migrate] failed: …`                                                        | `DATABASE_OWNER_URL` / `DB_*_PASSWORD` missing or invalid. The log names the missing variables, never their values.                                                                                                                                                             |
| `password authentication failed for user "fitcoach_system"` (28P01) with no `[migrate]` lines | The migration didn't run, so the roles don't exist. Clear any **Custom Start Command** (it replaces the image's migrate-then-start command) and redeploy.                                                                                                                       |
| API exits with "Invalid API configuration: …"                                                 | A variable failed validation, e.g. `WEB_ORIGIN` not https, `IP_HASH_SALT` shorter than 32 characters, or only some `STORAGE_*` set. The message names the variable.                                                                                                             |
| Login loops back to the login page                                                            | `WEB_ORIGIN` doesn't exactly match the web URL, or the browser called the API domain directly (the API has none, which is correct).                                                                                                                                             |
| 403 `CSRF_REJECTED` on forms                                                                  | `WEB_ORIGIN` mismatch (e.g. after adding a custom domain without updating it).                                                                                                                                                                                                  |
| Pages render without data or env values look empty                                            | `NEXT_PUBLIC_*` changed without a rebuild; redeploy web.                                                                                                                                                                                                                        |
| Readiness shows `storage: degraded`                                                           | R2 endpoint, bucket names or token scope wrong, or usage over the soft budget. API logs show "storage readiness check failed" with the S3 error.                                                                                                                                |
| Uploads refused "storage is full"                                                             | `STORAGE_HARD_LIMIT_BYTES` reached (shared R2 free tier). See [r2.md](r2.md).                                                                                                                                                                                                   |
| Public images 404                                                                             | `STORAGE_PUBLIC_BASE_URL` wrong, or the r2.dev URL isn't enabled on the public bucket.                                                                                                                                                                                          |
| Every user gets "too many attempts" at the same time                                          | Rate limits are per client IP. The API trusts `X-Forwarded-For` only from private-network hops and takes the address the Railway edge appended. If the edge adds another hop, all users share one bucket. Send Claude an API log line (IPs are hashed) to adjust `trust proxy`. |
| Jobs (e.g. the nightly file purge) don't run                                                  | App Sleeping is on for the API, or no API replica is up.                                                                                                                                                                                                                        |
| Staging smoke workflow fails "Set the STAGING_WEB_URL…"                                       | Add the repository variable (step 7).                                                                                                                                                                                                                                           |
