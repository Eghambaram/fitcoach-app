# ADR-0021: Starter program templates and ~100 seeded exercises ship as reference data

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D21, §8.5)

## Decision
A migration seeds ~100 generic exercises (gym, dumbbell, bodyweight, band, mobility) and 7 global, read-only starter programs (copy-to-edit) that use only seeded exercises.

## Why
A trainer must be able to build a real program in under 5 minutes.

## Consequences
- Global rows have `workspace_id IS NULL` and a read-only RLS policy.
- Descriptions and instructions are original, generic text with no outcome claims.
- Seeded exercises ship without media URLs and show a neutral placeholder icon (media upload is v1.1).
