# ADR-0032: Signup step 3 ("Business") fields

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q10; §12.2, §15

## Decision
Step 3 collects: business/display name (required), public page slug (prefilled from the name, unique, editable), city, coaching modes (in-person / online / hybrid), timezone (default `Asia/Kolkata`). Phone is optional.

## Why
The spec names the step (Account → Profile → Business) but not its fields; these are what the public page and first-run checklist need.

## Consequences
- The slug is reserved at signup, so publishing the page later is one tap.
- Country/currency default to IN/INR and live in Settings, not signup.
