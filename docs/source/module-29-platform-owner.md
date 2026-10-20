> **SUPERSEDED — history only.** Original Module 29 brief. The current platform-owner scope is `PROMPT.md` §16.0 (MVP) and §16.1 (v1.1+ reference). Do not build from this file.

---

MODULE 29 — PLATFORM OWNER & SAAS ADMINISTRATION

Extend FitCoach with a secure, independent Platform Owner workspace for operating the SaaS business.

Platform Owner Role

Create a dedicated platform-level role called "platform_owner".

This role is separate from "trainer" and "client". Do not implement it as a trainer account with additional frontend buttons.

Platform Owner permissions must be explicitly assigned, verified on the server and enforced through secure database policies and privileged API boundaries.

Platform Routes

Implement:

- "/platform/login"
- "/platform/dashboard"
- "/platform/trainers"
- "/platform/trainers/[id]"
- "/platform/clients"
- "/platform/subscriptions"
- "/platform/plans"
- "/platform/support"
- "/platform/announcements"
- "/platform/analytics"
- "/platform/health"
- "/platform/audit-logs"
- "/platform/settings"

Use a dedicated platform administration layout with a charcoal sidebar, white surfaces, lime-green primary actions, compact KPI cards, accessible tables and responsive mobile layouts.

Platform Dashboard

Display database-backed metrics for:

- Total registered trainers.
- Active and suspended trainers.
- Trainers in trial.
- Paying trainers.
- Active client count.
- Monthly recurring revenue, where billing data supports the calculation.
- Trial-to-paid conversion.
- Subscription renewals and failed payments.
- Support tickets requiring attention.
- Platform errors and integration failures.

Clearly define metric calculations and reporting periods. Never hardcode sample numbers into production.

Trainer Administration

Allow authorized platform owners to:

- Search and filter trainer accounts.
- View trainer registration and onboarding status.
- View subscription and plan metadata.
- Review workspace usage and account activity.
- Activate or suspend accounts with a recorded reason.
- Initiate authentication-provider password reset flows.
- Resolve account configuration issues.
- Review support history.

Do not reveal passwords or unrestricted private client records.

Suspension must not silently delete workspace data. Define the access restrictions, notification process and reactivation behavior.

Subscription and Plan Management

Create configurable subscription plans, billing intervals, trial durations, feature entitlements and usage limits.

Initial plan hypotheses may include:

- Free trial: 14 days.
- Solo: ₹499/month, up to 20 active clients.
- Pro: ₹999/month, with higher limits and additional features.
- Studio: ₹1,999+/month, for supported multi-trainer functionality.

Treat these as configurable launch hypotheses, not fixed business rules.

Implement subscription lifecycle states, invoice history, payment status, cancellation, upgrade/downgrade workflows, grace periods and reconciliation.

Integrate a payment provider through a server-side abstraction. Verify signed webhooks and make event processing idempotent. Never trust client-submitted payment status.

Do not claim that payment processing is active until credentials, webhook verification and provider configuration are complete.

Feature Entitlements

Enforce plan limits on the server and in the database-backed business logic.

Examples:

- Maximum active clients.
- Access to advanced analytics.
- Additional trainer seats.
- Custom branding.
- Optional nutrition features.
- Higher usage limits.

Keep entitlements configurable. A hidden frontend control is not a substitute for backend enforcement.

Do not introduce multi-trainer studio functionality until its membership, ownership and permission model is implemented.

Support Administration

Provide support tickets with:

- Requester.
- Affected workspace.
- Category and priority.
- Description.
- Assigned administrator.
- Status.
- Event history.
- Resolution notes.

Restrict access to sensitive records. If exceptional support access is implemented, require authorization, a documented purpose, limited duration and audit logging.

Platform Analytics

Provide reporting for:

- Trainer acquisition.
- Trial activation and conversion.
- Subscription distribution.
- Recurring revenue and churn, when data is available.
- Client usage.
- Feature adoption.
- Support volume.

Clearly distinguish actual collected revenue, subscription value and estimated recurring revenue.

Platform Health

Integrate configured monitoring for application errors, uptime, database connectivity, payment webhooks, email delivery and integration failures.

Show unknown or unavailable states honestly. Do not fabricate healthy status.

Database

Add and migrate:

- "platform_roles"
- "subscription_plans"
- "plan_entitlements"
- "subscriptions"
- "billing_customers"
- "billing_events"
- "invoices"
- "support_tickets"
- "support_ticket_events"
- "platform_announcements"
- "platform_settings"
- "audit_logs"

Adapt these tables to the existing schema, use foreign keys and appropriate constraints, and avoid duplicate sources of truth.

Security Requirements

- Explicitly assign platform roles.
- Enforce platform permissions server-side.
- Use strong authentication and MFA for privileged accounts where supported.
- Separate platform administration from trainer workspace access.
- Preserve tenant isolation.
- Audit privileged operations.
- Verify webhook signatures.
- Never expose service-role secrets to the browser.
- Avoid unrestricted impersonation.
- Test unauthorized access and cross-tenant isolation.
- Restrict access to sensitive client information by default.

Acceptance Criteria

The platform owner can securely sign in, review real platform metrics, manage trainer accounts, configure plans, inspect subscription states, process support workflows and review audit logs.

A trainer cannot access platform administration by changing a URL or modifying a client-side role value.

A client cannot access trainer or platform administration.

A platform owner action that changes an account, subscription or permission is authorized, persisted and auditable.

All platform administration features must use actual backend data or explicitly report that a required integration is not configured.

Implement this module after the core trainer, lead conversion and client management workflows have a stable database and authorization foundation.