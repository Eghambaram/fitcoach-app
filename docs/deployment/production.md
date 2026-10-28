# Production environment

How to create FitCoach's **production** environment on Railway and Cloudflare (PROMPT §17, step 6.2). It mirrors staging ([railway.md](railway.md), [r2.md](r2.md)). The differences are below, and the API refuses to start if a production rule is broken.

## What's different from staging

| Area           | Staging                              | Production                                                                                        |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Deploys from   | `main` (after CI)                    | `production` branch, fast-forwarded by the **Promote to production** workflow (approval required) |
| Web domain     | `*.up.railway.app`                   | `app.<domain>` (custom domain)                                                                    |
| Public media   | r2.dev URL                           | `media.<domain>` (R2 custom domain + Cloudflare cache); r2.dev is **refused**                     |
| Email          | Resend test sender is fine           | Resend with your verified domain; `console` is **refused**                                        |
| Secrets        | own values                           | **new** values (never copy staging's)                                                             |
| Nightly backup | in the API (`NIGHTLY_BACKUP=in_api`) | the db-backup service (`NIGHTLY_BACKUP=external` + `BACKUP_HEARTBEAT_TOKEN`)                      |
| OpenAPI docs   | served at `/v1/docs`                 | not served                                                                                        |
| App Sleeping   | allowed                              | **off** for web and api (pg-boss schedules live in the API)                                       |
| Ribbon         | "Staging environment"                | none                                                                                              |

Production-only config checks (the API names the variable and exits): https `WEB_ORIGIN`; `IP_HASH_SALT` of at least 32 characters; no `console` email; R2 configured, with `STORAGE_PUBLIC_BASE_URL` not on `r2.dev`; `BACKUP_HEARTBEAT_TOKEN` set; and `APP_ENCRYPTION_KEY` not the local example key. Session cookies are `Secure` (the same as staging).

## Variable files

Fill these in, paste them into Railway (Raw Editor), and never commit the filled-in copies:

- [`infra/railway/production/api.env.example`](../../infra/railway/production/api.env.example)
- [`infra/railway/production/web.env.example`](../../infra/railway/production/web.env.example)
- [`infra/railway/production/db-backup.env.example`](../../infra/railway/production/db-backup.env.example)
- [`infra/railway/production/github.env.example`](../../infra/railway/production/github.env.example) (the `PRODUCTION_WEB_URL` repository variable)

The step-by-step setup is [the checklist below](#checklist).

## Release flow (PROMPT §17.4)

1. Merge to `main` → CI → staging deploys → **Staging smoke** passes.
2. GitHub → Actions → **Promote to production** → **Run workflow** (optionally a specific `main` commit).
   - It waits for approval on the `production` environment.
   - It checks that Staging smoke passed for that commit.
   - It fast-forwards the `production` branch. It never force-pushes.
3. Railway deploys production from `production`. The API migrates on start, and a failed migration leaves the old deploy serving.
4. **Production smoke** runs against `PRODUCTION_WEB_URL`.

Rollback: Railway → the service → Deployments → the last good one → **Redeploy**. Migrations are backward-compatible with the previous release.

## Checklist

### Cloudflare

1. **Domain:** add your domain to Cloudflare (nameservers) if it isn't there yet.
2. **R2 buckets:** create `fitcoach-prod-private` and `fitcoach-prod-public` — Standard class, location hint **APAC**.
3. **Custom domain:** `fitcoach-prod-public` → Settings → **Custom Domains** → **Connect domain** → `media.<domain>`. Wait for **Active**. Keep **r2.dev disabled** on both production buckets.
4. **Cache rule:** Caching → Cache Rules → **Create rule**, matching hostname `media.<domain>` → **Eligible for cache**, edge TTL 1 year. Object keys are immutable.
5. **Lifecycle rules** on `fitcoach-prod-private`:
   - `exports/` → delete after 1 day;
   - `backups/daily/` → after 8 days;
   - `backups/weekly/` → after 35 days;
   - abort incomplete multipart uploads after 1 day.
6. **R2 API token:** name `fitcoach-production`, **Object Read & Write**, **only** the two `fitcoach-prod-*` buckets. Copy the Access Key ID and Secret now.
7. **Email:** Resend → Domains → add and verify your domain (DNS records in Cloudflare). Create a production API key. Use `EMAIL_FROM=FitCoach <noreply@<domain>>`.

### Railway

8. **Postgres:** Project `fitcoach` → environment **production** → **+ Create → Database → PostgreSQL**, named `Postgres`.
   - Use the **same major version** as staging.
   - Postgres → **Backups**: enable daily + weekly. Enable **Point-in-Time Recovery** if your plan offers it.
9. **API service:** **+ Create → GitHub Repo** → `fitcoach-app`.
   - Rename it **`api`**.
   - Source: branch **`production`**, with **Wait for CI** on.
   - Health check `/v1/health` (timeout 120); restart On Failure, 5.
   - No custom start or pre-deploy command.
   - No public domain.
   - Paste the API variables, with new secrets.
10. **Web service:** **+ Create → GitHub Repo** → `fitcoach-app`.
    - Rename it **`web`**.
    - Source: branch `production`, **Wait for CI** on.
    - Health check `/healthz` (timeout 60).
    - Paste the web variables.
11. **App Sleeping:** turn it **off** on web and api (Settings → Deploy).
12. **db-backup service:** **+ Create → GitHub Repo** → `fitcoach-app`.
    - Rename it **`db-backup`**.
    - Source: branch `production`.
    - Settings → Deploy → **Cron Schedule** `30 20 * * *` (02:00 IST); **Restart Policy** Never.
    - Paste the db-backup variables.
13. **Web domain:** web → Settings → Networking → **Custom Domain** → `app.<domain>`, target port **3000**.
    - Add the CNAME Railway shows in Cloudflare DNS, **DNS only** (grey cloud) so Railway can issue the certificate.
    - When it's verified, `WEB_ORIGIN` and `NEXT_PUBLIC_SITE_URL` are `https://app.<domain>`.
14. **Usage alerts:** Project → Settings → **Usage** → set a usage limit and an email alert.

### GitHub

15. **Production environment:** Settings → **Environments** → **New environment** `production` → **Required reviewers**: you.
16. **Repository variable:** `PRODUCTION_WEB_URL=https://app.<domain>`.
17. **First release:** Actions → **Promote to production** → Run → approve. This creates the `production` branch, and Railway deploys it.

### First run

18. **Readiness:** `https://app.<domain>/api/v1/health/ready` → `ok`.
19. **Platform owner:**
    - Sign up at `https://app.<domain>/signup` with an invite code. Create one in the api container with `node dist/cli/beta-invite.js create --uses 1 --days 1 --label owner`, then sign up.
    - In the api container: `node dist/cli/platform-grant.js <your email>`.
    - Open `/platform/login` and set up your authenticator. Store the recovery codes offline.
20. **Backup:** db-backup → **Deploy** once by hand. Within a minute, Platform → System Health → Backups shows **OK**, and the dump is in `fitcoach-prod-private/backups/daily/`.
21. **Restore drill:** run it once into a scratch database ([restore.md](../runbooks/restore.md)), then monthly.
