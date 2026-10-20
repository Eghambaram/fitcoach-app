# ADR-0041: File uploads: one API pipeline, profile photo in the public bucket, ledger-based budget

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.5; D11, §10.2, §17.7

## Decision

(1) Every upload goes through `POST /v1/files/…` on the API: multer keeps the file in memory (10 MB limit, nothing written to the container disk), sharp decodes the **real bytes** (JPEG, PNG, WebP; the claimed Content-Type is ignored), applies the EXIF orientation, drops all metadata and writes WebP plus a thumbnail. Avatars are 512 px (thumb 128 px), photos 1600 px (thumb 400 px). Originals are never stored. (2) The trainer profile photo is the `trainer_avatar` kind in the **public** bucket, because the same photo appears on the public page (step 2.1). `public_page_photo` and `client_avatar` (private bucket) are already allowed by the `files` CHECKs, but their endpoints ship with the steps that use them, so nothing is scaffolded early. (3) Budget: `StorageService.usage()` sums `files.size_bytes` (cached 5 min, bumped after each write). An upload is refused with `507 STORAGE_FULL` when `used + 10 MB ≥ STORAGE_HARD_LIMIT_BYTES`. At `STORAGE_BUDGET_BYTES`, `/v1/health/ready` reports storage "degraded". (4) Without `STORAGE_*` configured, uploads answer `503 STORAGE_NOT_CONFIGURED` and readiness reports "not_configured". The variables are all-or-nothing. (5) Soft delete sets `files.deleted_at`. A daily pg-boss job (`files.purge`, 03:15 UTC, idempotent) deletes objects older than 7 days and sets `purged_at`. Ledger rows are never deleted. (6) HEIC isn't accepted yet. The error message tells iPhone users to share as JPEG.

## Why

A single pipeline is the only place to enforce EXIF stripping, size and budget rules (CLAUDE.md "Cloudflare R2"). Checking the decoded format stops renamed files. Reserving a full 10 MB of headroom means one upload can't push storage past the hard limit. Counting from the ledger costs no R2 Class A operations.

## Consequences

- Orphaned objects (upload succeeded, ledger insert failed) are left for the weekly reconciliation job in step 5.2.
- Owner notification at the soft budget arrives with platform notifications (step 6.x). Until then, the health check is the signal.
- CI runs a RustFS service and `pnpm storage:init`. The API suite starts its own RustFS through Testcontainers.
