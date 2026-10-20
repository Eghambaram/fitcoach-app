# ADR-0014: Messaging in the MVP = communication log + click-to-chat; no chat

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D14, §8.10)

## Decision
No Messages page and no persisted chat threads. Drawers offer WhatsApp / Call / Email actions and a "Log contact" form that writes `communication_logs`. The client app shows a "Contact trainer" card.

## Why
No fake real-time chat; real chat needs SSE + LISTEN/NOTIFY and moderation the beta does not need.

## Consequences
- Board 04 screen 10 (Messages) and the dashboard "New messages" KPI are replaced.
- `message_threads` and `messages` tables are not created.
