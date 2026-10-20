# ADR-0028: Phase 2 order: conversion and onboarding before the calendar

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q1; amends §20, PHASES.md

## Decision

Phase 2 now runs 2.1 Settings + public page → 2.2 Leads → 2.3 Follow-ups → **2.4 Conversion → 2.5 Onboarding → 2.6 Calendar**. Steps were renumbered; references in PHASES.md, PROMPT §20, `docs/design/README.md`, `docs/architecture.md` and `docs/mvp-plan.md` were updated.

## Why

Recurring series and client sessions need the `clients` table, which is created by conversion. In the original order, the calendar step's "Done when" (create a Mon/Wed/Fri series) couldn't be met.

## Consequences

- Trial booking (lead appointments) moves to 2.6 with the rest of the calendar; conversion doesn't depend on a trial.
- The step 2.2 duplicate check covers leads first; 2.4 extends it to clients.
- The attendance hook that 3.2 implements now comes from step 2.6.
