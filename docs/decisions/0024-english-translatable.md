# ADR-0024: English UI at launch with translatable strings

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D24)

## Decision
All UI copy is English and kept out of business logic so it can be extracted into message catalogues later.

## Why
Hindi, Tamil and other languages later without a rewrite.

## Consequences
- No hard-coded copy inside services or validation logic; API errors return a code plus an English message.
- A full i18n framework is wired only if it is cheap to add in step 1.4.
