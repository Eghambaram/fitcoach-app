# ADR-0036: RustFS replaces MinIO for local object storage

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.1; amends D2, §11, §18

## Decision

Local S3-compatible storage runs **RustFS** (`rustfs/rustfs`, Apache-2.0, MinIO-compatible, same ports 9000/9001) as the `storage` compose service. A one-shot `storage-init` job uses the official AWS CLI image to create `fitcoach-local-private` and `fitcoach-local-public` and to put an anonymous-read policy on the public bucket. Staging and production still use Cloudflare R2.

## Why

MinIO no longer publishes container images: on 2026-10-20 `minio/minio`, `minio/mc` and their quay.io mirrors could not be pulled. RustFS is the closest drop-in and is actively released. Verified locally: public bucket anonymous GET 200, private bucket anonymous GET 403, private presigned GET 200.

## Consequences

- The `StorageService` code path is unchanged; only `STORAGE_*` env values differ between RustFS and R2.
- References to MinIO in PROMPT.md, CLAUDE.md and PHASES.md were updated to RustFS.
- If RustFS ever diverges from R2 behaviour we rely on, alternatives are SeaweedFS or Garage; R2 itself stays the reference in staging.
