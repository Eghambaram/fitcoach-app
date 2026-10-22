# ADR-0045: Leads list and drawer: honest KPIs, URL filters, keyset paging, notes as timeline entries

- **Status:** Accepted
- **Date:** 2026-10-22
- **Source:** Step 2.2; §8.2, §1A.1

## Decision

(1) **KPI cards show only what exists**: open leads, new this week (Monday start, workspace time zone), enquiries from the public page in the last 30 days. "Follow-ups due", "upcoming trials" and "converted this month" join the cards with steps 2.3, 2.6 and 2.4. The next-follow-up column, sort and filter likewise arrive in 2.3. (2) **Filters live in the URL** (`?stage=&q=&source=&mode=&sort=&archived=`). The list and tab counts are server-rendered, and the lead drawer is `?lead=<id>`; `/app/leads/<id>` redirects there, so notification links work. (3) **Keyset pagination** with an opaque cursor (sort value + id) for every sort. Search is `ILIKE` on name, email and phone (pg_trgm GIN indexes), plus goal and source by their labels, with `%`/`_` escaped. (4) **Duplicate detection** compares the normalised E.164 phone and the lower-cased email across the workspace's leads. It is non-blocking ("Possible match": Open / Create anyway). Clients join the check in step 2.4, when the clients table exists. (5) **Notes are `lead_activities` rows of type `note`**: private, append-only, kept apart from the Activity tab. There's no separate notes table, and editing history isn't possible by design. (6) **Delete only untouched leads** (nothing beyond `created` / `enquiry_received`); anything with history is archived (`archived_at`) and hidden from the list unless "Show archived" is on. Deleting a public-page lead also removes its consent record, which is the point of deleting. (7) **Stages**: trainers set any stage except `converted` (RLS refuses it; the conversion transaction in 2.4 is the only way). Lost needs a reason and allows a "try again after" date, and both are cleared when the lead re-opens. (8) **Coming soon, not hidden**: the drawer footer shows disabled "Book trial" and "Convert to client" with a "coming soon" line. WhatsApp opens a plain chat now; templates and the "Sent" log are step 2.3. (9) **CSV export** has the same filters, a UTF-8 BOM, formula-injection neutralising on free-text cells, a 5,000-row cap, and stays allowed for suspended workspaces.

## Why

The beta's honesty rules forbid placeholder numbers and dead navigation, yet the board shows features from later steps. URL state makes every view shareable and refresh-safe, and keeps reads in Server Components (D9). Keyset paging stays correct while leads arrive.

## Consequences

- Exports of client modules aren't values on the server: constants shared by a server page and a client component (e.g. `LEAD_PARAMS`) live in plain modules.
- New error code `CONFLICT_STATE` (state conflicts such as "has history, archive instead" or "already a client").
