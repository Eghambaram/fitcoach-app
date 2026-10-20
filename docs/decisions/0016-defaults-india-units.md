# ADR-0016: Defaults: IN / INR / Asia/Kolkata per workspace; canonical kg and cm

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D16)

## Decision

Each workspace stores country (default `IN`), currency (`INR`) and an IANA timezone (`Asia/Kolkata`). Measurements are stored in kg/cm and converted for display per user preference.

## Why

Target-market defaults with consistent maths.

## Consequences

- "Today", "overdue", streaks and job times use the workspace timezone; servers run UTC.
- Phones are normalised to E.164 with the workspace country before duplicate checks.
- Money is integer paise, displayed with Indian grouping (₹1,23,456).
