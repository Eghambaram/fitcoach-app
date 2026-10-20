# ADR-0012: Subscription billing is v1.1; the closed beta is free with manual plan assignment

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D12)

## Decision
No Razorpay, subscriptions, invoices or billing pages in the MVP. The platform owner assigns plans, client limits and trial ends manually (audited) through `workspace_plans`. A seeded `beta` plan carries the active-client limit.

## Why
Validate value before charging; never trust the browser for billing state.

## Consequences
- Tables `subscriptions`, `billing_*`, `invoices` and `plan_entitlements` are not created.
- The pricing page shows "Free during beta" + request access; the platform overview shows "Billing not configured".
- Billing-related workspace statuses (`past_due`, `cancelled`) exist in the enum but stay unused until v1.1.
