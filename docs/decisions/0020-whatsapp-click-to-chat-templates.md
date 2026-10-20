# ADR-0020: WhatsApp-first communication through click-to-chat message templates

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D20, §8.12)

## Decision

`message_templates` (one per purpose per workspace: follow_up, trial_confirmation, client_invite, payment_reminder, package_renewal, check_in_nudge, session_reminder) with known placeholders. Rendered text is URL-encoded into `https://wa.me/<E164 without +>?text=…`. A `communication_logs` row is written only when the trainer confirms "Sent".

## Why

Zero cost, no approval process, and it matches how trainers already work.

## Consequences

- Unknown placeholders are rejected on save; defaults stay short (very long `wa.me` URLs fail on some phones).
- The product never claims a WhatsApp message was delivered.
- The WhatsApp Business API is Later.
