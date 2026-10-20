# ADR-0030: Record product events from step 1.3

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q5; §10.2, §1A.5

## Decision

`product_events` (actor, workspace, event name, properties jsonb, occurred_at — no PII) and a small `track()` helper are created in step 1.3. The first events are `trainer_signed_up` and `email_verified`; each later step adds the events for its feature; step 5.3 audits coverage against every §1A.5 metric.

## Why

If tracking started in 5.3, signups and the alpha week would go unrecorded and beta metrics would start late.

## Consequences

- Every step's definition of done includes its product events.
- Activation can also be computed from real tables as a cross-check (`docs/metrics.md`, step 5.1).
