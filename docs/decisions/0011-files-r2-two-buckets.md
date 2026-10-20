# ADR-0011: Files in Cloudflare R2 with a private and a public bucket per environment

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D11, §17.7)

## Decision
`fitcoach-<env>-private` (avatars, exports, backups; presigned GET ≤ 5 min after an auth check) and `fitcoach-<env>-public` (public-page photos, global exercise media; served from `media.<domain>`). Uploads go through the API: type/size check, `sharp` EXIF strip, WebP ≤ 1600 px + 400 px thumbnail, a `files` row as the storage ledger.

## Why
Private by default, cheap CDN delivery for public images, no location metadata kept, no surprise bills.

## Consequences
- `StorageService.usage()` enforces an 8 GiB soft budget and a 9 GiB hard limit.
- Soft delete + 7-day purge (R2 has no versioning).
- S3 client: `region "auto"`, checksum options `WHEN_REQUIRED`.
- Private images are rendered `unoptimized`, never through the Next image cache.
