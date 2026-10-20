# ADR-0023: No progress photos in the MVP

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D23)

## Decision

Progress photo upload, storage and viewing are v1.1. The onboarding wizard still captures a separate, optional photo consent.

## Why

Highest privacy and storage cost; validate demand first.

## Consequences

- No `progress_photos` table, routes or UI.
- MVP storage is limited to avatars, public-page photos, exports and backups.
