# ADR-0022: No group or batch sessions in the MVP

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D22)

## Decision

Each appointment has exactly one of `client_id` or `lead_id` (`CHECK (num_nonnulls(client_id, lead_id) = 1)`).

## Why

Keeps scheduling, conflict checks and package maths simple.

## Consequences

- Listed as a known limitation in the `/beta` FAQ.
- Revisit if ≥ 3 beta trainers ask.
