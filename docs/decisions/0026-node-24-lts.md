# ADR-0026: Standardise on Node 24 LTS

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q2; amends §17.2

## Decision
Node 24 LTS everywhere: `engines` in package.json, `.nvmrc`, GitHub Actions, and `node:24-bookworm-slim` Docker images. PROMPT §17.2 and PHASES.md were updated from Node 22.

## Why
The founder's machine already runs Node 24; Node 22 leaves LTS support in April 2027, shortly after the beta. Local, CI and production should run the same major.

## Consequences
- Contributors on Node 22 get an `engines` warning.
- Native modules (`sharp`, `@node-rs/argon2`) must have Node 24 builds — both do.
