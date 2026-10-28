# ADR-0058: Progress — measurements, custom types, per-metric sharing and the client view

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 4.4; §8.8 (photos are v1.1), §9, §6, §10.5, CLAUDE.md rules 7, 16, 19, 21

## Decision

1. **Measurements stay append-only** (rule 16; migration 0016). A correction voids the value (`voided_at`, reason, who) and the right value is added as a new one.
   - The trainer's Progress tab lists corrected values with the reason under "Corrected values".
   - Values are stored in canonical units (kg, cm, %). The API converts from the entered unit (kg/lb, cm/in) and checks a plausible range per metric.
   - Dates can't be in the future (workspace time zone).
2. **Custom measurement types** are rows of `measurement_types` with the workspace's id. The key comes from the name; the name is unique per workspace (case-insensitive).
   - The kind (weight, length, percent, number) decides the units it can be entered in.
   - Global types stay read-only. Retiring a custom type (`is_active`) is allowed by the database; the UI for it is v1.1.
3. **Sharing is per metric:** one row per shared metric in `progress_shares`, and nothing is shared by default. The trainer replaces the whole set from the Progress tab, together with the client's "add their own values" switch (`features.progressSelfLogging`).
4. **What the client sees is decided by RLS.**
   - A client reads only measurements of metrics shared with them.
   - They insert their own values (`source = 'client'`) only with self-logging on, and only for a shared metric.
   - Voided values and the trainer's notes never reach the client app.
5. **Summaries.** First vs latest and the absolute change. A % change is shown only for body weight, labelled "of body weight", where it's meaningful (§8.8).
   - Charts have 1M/3M/6M/1Y/All ranges, date tooltips and units; below two values they show an empty state.
   - Each chart has a text alternative listing its values.
6. **`/app/progress`** (now in the trainer nav) lists each client's own recent changes: the last 90 days, up to three metrics each, newest activity first. It never averages across clients.
7. **Client app.** **Progress** joins the client nav: Home · Workouts · Progress · Check-in · More. Schedule moves into More, as in §6.
   - The client home shows up to two shared-metric tiles, body weight first, only when the trainer has shared that metric (§7.3 "Progress −2.4 kg" adjusted).
8. **Units.** The trainer sees the workspace units. The client sees their own units from Profile, falling back to the workspace default. The pure formatting helpers live in `features/progress/format.ts`, so server components can use them.

## Why

The "Done when" is a privacy test: share weight only, and the client must see weight but not waist. Enforcing it in RLS, not only in the API, means a later screen can't leak an unshared metric by mistake.

## Consequences

- Step 5.1 "no measurement for M days" reads the latest live `measured_on` per client.
- Progress photos (v1.1) can reuse `progress_shares` with a photo flag or a separate table.
