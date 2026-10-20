> **SUPERSEDED — history only.** This is the original product brief as first written (Supabase/Vercel stack, full scope). The current source of truth is `PROMPT.md` (MVP Edition): Next.js + NestJS + PostgreSQL on Railway, Cloudflare R2, MVP cut line in §1A. Do not build from this file.

---

FITCOACH — Complete Master Product & Application Build Prompt

1. Your Role

Act as an elite product team consisting of:

- A Fortune 500-level Product Manager and SaaS Product Owner.
- A top 1% UI/UX designer specializing in premium fitness applications.
- A Senior Full-Stack Engineer specializing in Next.js, TypeScript and PostgreSQL.
- A database architect experienced in multi-tenant SaaS and Row-Level Security.
- A QA engineer, accessibility specialist and DevOps engineer.

Your mission is to design, architect and build FitCoach — Personal Trainer Copilot, a production-ready, mobile-first personal trainer business management platform.

Do not stop at wireframes, mockups, static HTML, or a landing page. Build a cohesive, functional application with connected screens, real forms, database persistence, authentication, authorization, error handling and deployment documentation.

Make reasonable product decisions without repeatedly asking for approval. When a third-party integration requires credentials, build the integration boundary, document the configuration and provide a functional development fallback.

---

2. Product Vision

FitCoach helps independent personal trainers manage their entire coaching business from a single application.

The platform must help trainers:

1. Capture and convert prospective clients into paying clients.
2. Manage client onboarding, goals and training preferences.
3. Plan workouts and record exercise performance.
4. Track client progress and adherence.
5. Manage in-person, online and hybrid training sessions.
6. Collect daily client check-ins.
7. Identify follow-ups, missed sessions and clients needing attention.
8. Share relevant progress with clients.
9. Manage the business efficiently from a mobile device.

Target users

Primary user: Independent personal trainers with approximately 10–50 clients, including trainers who coach clients online and at gyms.

Secondary user: A trainer's client, who needs a simple interface to view assigned workouts, complete check-ins and see progress shared by their trainer.

Core product promise

"Spend less time managing your coaching business and more time helping clients get results."

Product principles

- Trainer-first workflows.
- Mobile-first, with a complete desktop experience.
- Minimal client complexity.
- Fast daily actions.
- Consistent and trustworthy progress tracking.
- Privacy by default.
- No unnecessary enterprise complexity.
- Every feature must solve a real trainer or client problem.

---

3. Technology Stack

Use the following stack unless the existing repository already has an equivalent, working implementation.

Layer| Technology
Framework| Next.js App Router
Language| TypeScript, strict mode
UI| React
Styling| Tailwind CSS
Component system| shadcn/ui with accessible Radix primitives
Icons| Lucide React
Forms| React Hook Form
Validation| Zod
Server state| TanStack Query where useful
Database| Supabase PostgreSQL
Authentication| Supabase Auth
Authorization| PostgreSQL Row-Level Security
File storage| Supabase Storage
Charts| Recharts
Date handling| date-fns
PWA| Web app manifest, service worker and install support
Testing| Vitest, React Testing Library and Playwright
Hosting| Vercel
Source control| GitHub

Use the installed package manager and existing repository conventions. Do not replace working dependencies without a clear reason.

Use server components by default. Add client components only where interaction or browser APIs require them.

Keep business logic out of presentation components. Use validated server actions or route handlers for mutations and integrations.

Do not build microservices, add Redis or introduce complex AI infrastructure in the MVP.

---

4. User Roles and Access Control

Implement two primary roles.

A. Trainer

The trainer owns their workspace and can:

- Manage leads and lead sources.
- Create, edit and archive clients.
- Complete client onboarding.
- Create workout plans and assign exercises.
- Manage calendar appointments and trial sessions.
- Record workout completion and client progress.
- Review daily check-ins.
- View trainer-only notes and business metrics.
- Generate and manage public enquiry links.
- Configure profile, availability and preferences.

B. Client

Clients must have deliberately limited access.

They can:

- Open their assigned client experience.
- View their assigned workouts and training schedule.
- Record workout completion where enabled.
- Submit daily check-ins.
- View their own progress that the trainer has chosen to share.
- View permitted appointment information.
- Update only explicitly permitted profile fields.

Clients must never access:

- Lead CRM or other prospects.
- Other clients' profiles or data.
- Trainer-only notes.
- Sales pipeline, conversion metrics or revenue reports.
- Private assessment notes.
- Unshared measurements, photos or health-related information.
- Administrative settings.

Implement role checks on the server and in database policies. Hiding a button is not authorization.

A trainer may create client access invitations. Do not force clients to register for the initial MVP if a secure, expiring check-in link is sufficient for the intended workflow. Never use predictable identifiers or unrestricted public access as a substitute for authentication.

---

5. Global Application Structure

Build two distinct experiences that share the same backend.

Trainer workspace

Desktop navigation:

1. Dashboard
2. Leads
3. Clients
4. Calendar
5. Programs
6. Workouts
7. Nutrition
8. Check-ins
9. Progress
10. Messages
11. Billing
12. Templates
13. Settings

On mobile, prioritize:

- Home
- Leads
- Clients
- Calendar
- More

Move lower-frequency features into More on mobile. Use a compact bottom navigation and touch-friendly controls.

Client workspace

Client navigation:

- Home
- Workouts
- Progress
- Check-ins
- More

Only display features the trainer has enabled for that client.

The client application must use the same branding but be simpler, calmer and more focused than the trainer dashboard.

---

6. Design System and Visual Direction

Use the supplied FitCoach reference images as the primary visual direction.

Brand personality

- Premium.
- Confident.
- Modern.
- Human.
- Motivating without being aggressive.
- Professional enough for a serious coaching business.

Color palette

Create design tokens based on:

- Charcoal: "#18211D"
- Primary lime: "#C8F169"
- Lime hover: "#A9D846"
- Main background: "#F6F7F3"
- Card background: "#FFFFFF"
- Primary text: "#18201C"
- Secondary text: "#6C756F"
- Borders: "#E6EAE5"
- Semantic success, warning, danger and information colors with accessible contrast.

Use lime primarily for primary actions, selected navigation and meaningful positive indicators. Avoid making every element bright green.

Layout

- Desktop: persistent charcoal sidebar, generous content area and compact top bar.
- Mobile: full-width screens, clear page hierarchy and thumb-friendly actions.
- Cards: consistent radii, subtle borders and restrained shadows.
- Tables: readable typography, sensible column density and mobile card transformations.
- Drawers: right-side desktop drawers and full-screen mobile detail views.
- Forms: explicit labels, validation messages and clear save/cancel actions.
- Charts: readable axes, useful legends, tooltips and appropriate empty states.

Typography

Use a modern sans-serif typeface such as Inter. Maintain a consistent spacing scale, typography hierarchy, icon size and component behavior.

Accessibility

Target WCAG 2.2 AA where practical.

Support keyboard navigation, visible focus, screen-reader labels, accessible dialogs, sufficient contrast and reduced-motion preferences.

Do not rely on color alone to communicate status.

Use real, properly licensed fitness imagery where useful. Do not invent client testimonials, medical claims or fabricated performance results.

---

7. Trainer Dashboard

The dashboard must answer: "What do I need to do today?"

Header

- Personalized greeting.
- Current date.
- Global search.
- Notifications.
- Trainer profile menu.

KPI cards

- Sessions today.
- Active clients.
- New leads.
- Follow-ups due or overdue.
- Check-ins awaiting review.

Use real database counts. Do not hardcode example numbers in the production UI.

Today's schedule

Each appointment should show:

- Client or prospect.
- Session type.
- Start time and duration.
- In-person or online mode.
- Location or meeting link where appropriate.
- Appointment status.
- Contextual Start, Join, View or Complete action.

Needs attention

Prioritize:

1. Overdue lead follow-ups.
2. Follow-ups due today.
3. Upcoming trials.
4. Client check-ins needing review.
5. Missed sessions.
6. Clients whose progress needs review.

Use configurable business rules. Do not make unsupported health or performance diagnoses.

Recent activity

Display useful events such as:

- New lead received.
- Trial booked.
- Client converted.
- Workout completed.
- Check-in submitted.
- Progress measurement recorded.

Every dashboard card should link to the relevant filtered screen.

---

8. Lead CRM — Core Business Growth Module

Leads are a first-class section inside the trainer workspace, not a separate application.

8.1 Lead capture channels

Implement:

- Manual lead entry.
- Public enquiry form.
- Trainer-specific public enquiry page.
- Shareable enquiry URL.
- QR code linking to the enquiry page.
- Source attribution.
- WhatsApp click-to-chat.

Design integration boundaries for later Meta lead ads and WhatsApp Business Platform automation. Do not claim automated message ingestion unless it is genuinely configured.

8.2 Lead pipeline

Support these stages:

- New.
- Contacted.
- Trial booked.
- Interested.
- Converted.
- Lost / nurture.

Allow the trainer to change stages from the list and detail drawer.

Keep stage transitions and conversion history in the database.

8.3 Lead CRM screen

Provide:

- Page title and concise business-growth subtitle.
- KPI cards for total open leads, new enquiries, follow-ups due, upcoming trials and conversions.
- Search by name, phone, goal and source.
- Filters for stage, source, training mode and follow-up date.
- Sorting by next follow-up, creation date and name.
- List view and Kanban board.
- Add Lead button.
- Share Enquiry Page button.
- Empty states, loading states and error recovery.
- Pagination or server-side filtering as lead volume grows.

Every lead row must display:

- Name.
- Primary fitness goal.
- Training mode.
- Lead source.
- Pipeline stage.
- Next follow-up.
- Last contact.
- Contextual actions.

8.4 Lead detail drawer

Desktop: slide in from the right without navigating away from the list.

Mobile: full-screen detail page with an accessible back action.

Include tabs for:

Overview

- Contact details.
- Goal and training mode.
- Source attribution.
- Preferred training schedule.
- Lead stage.
- Next action.
- Private trainer notes.
- Trial appointment information.

Activity

- Enquiry received.
- Calls, messages and emails recorded.
- Follow-ups scheduled and completed.
- Trial booked, attended or cancelled.
- Stage changes.
- Conversion history.

Details

- Editable contact details.
- Fitness goal.
- Training mode.
- Location.
- Preferred schedule.
- Original source and campaign.
- Referral details.
- Additional notes.

Primary actions:

- WhatsApp.
- Call.
- Schedule follow-up.
- Book trial.
- Edit lead.
- Mark lost.
- Convert to client.

Persist changes immediately or through explicit save actions with appropriate success and error feedback.

8.5 Add Lead form

Required fields:

- Full name.
- At least one usable contact method.
- Primary fitness goal.
- Lead source.

Optional fields:

- Phone.
- Email.
- Training mode: in-person, online or hybrid.
- Preferred schedule.
- Location.
- Interested service.
- Referrer.
- Campaign identifier.
- Initial notes.
- Next follow-up.

Validate phone and email formats appropriately. Normalize phone numbers where possible. Detect likely duplicates within the trainer's workspace and offer to open or link the existing record instead of creating an accidental duplicate.

8.6 Follow-up management

Each follow-up must have:

- Lead.
- Action type.
- Due date and time.
- Status.
- Notes.
- Completion timestamp.
- Reminder preference.

Support WhatsApp, phone call, email, trial confirmation and package discussion as action types.

Show overdue and due-today tasks on the dashboard.

Do not claim a reminder was delivered unless the notification mechanism actually ran.

8.7 Trial booking

Book trials from the lead drawer and connect them to Calendar.

Fields:

- Lead.
- Date.
- Start time.
- Duration.
- Training mode.
- Location or online meeting link.
- Session notes.
- Booking status.

Validate trainer availability and prevent conflicting bookings.

Support scheduled, confirmed, completed, cancelled and no-show states.

Record attendance and trial outcome. A trial booking alone must not convert a lead into a client.

8.8 Public enquiry page

Provide a trainer-specific public URL with:

- Trainer name and profile.
- Short introduction.
- Available coaching types.
- In-person, online and hybrid options.
- Fitness goal selection.
- Name and contact fields.
- Preferred availability.
- Optional message.
- Privacy notice and appropriate consent.
- Clear submit button.
- Success and error states.

Capture the original source and campaign where available.

Public forms must be rate-limited and protected against spam. Validate every submission on the server. Never expose private trainer data through public queries.

Generate a QR code for the public URL.

8.9 Lead-to-client conversion

This workflow is critical.

When the trainer converts a lead:

1. Check for an existing client using appropriate normalized contact matching.
2. If a matching client exists, offer to link the lead instead of duplicating the client.
3. Create the client profile transactionally.
4. Transfer relevant name, contact details, goal, training mode, preferences and source attribution.
5. Preserve the original lead and activity history.
6. Record conversion timestamp and trainer.
7. Optionally record the initial package and coaching start date.
8. Open the existing Add Client onboarding flow for remaining fields.
9. Update dashboard metrics and the client list.

Make conversion idempotent and safe against repeated clicks or concurrent requests.

Do not mark a prospect as a converted client if the client record failed to be created.

---

9. Client Management

Client list

Provide tabs for:

- Active.
- Paused.
- Archived.

Include search, filtering and sorting.

Each row or card should show:

- Client name and photo/avatar.
- Primary goal.
- Training mode.
- Client status.
- Next session.
- Last check-in.
- Progress indicator when meaningful.

Client detail page

Use tabs:

- Overview.
- Progress.
- Workouts.
- Schedule.
- Check-ins.
- Nutrition, if enabled.
- Notes.

The overview should show:

- Client goals.
- Training mode.
- Current plan.
- Recent activity.
- Attendance and adherence.
- Latest approved progress metrics.
- Next appointment.
- Trainer quick actions.

All metrics must come from real stored records and use clearly defined calculations.

Client lifecycle

Support active, paused and archived states.

Archiving must preserve historical workouts, measurements, appointments and lead attribution.

Do not permanently delete historical data as an unintended side effect of archiving.

---

10. Add Client Onboarding Wizard

Build a multi-step, mobile-friendly wizard with save-as-draft support.

Step 1 — Basic information

- Full name.
- Phone.
- Email.
- Preferred contact method.
- Date of birth, optional.
- Profile photo, optional.
- Emergency contact, optional and access-restricted.

Step 2 — Goals and training

- Primary goal: weight loss, muscle gain, strength, general fitness, mobility, endurance or other.
- Secondary goals, optional.
- Training mode: in-person, online or hybrid.
- Training location or online preference.
- Preferred days and times.
- Experience level.
- Equipment availability.
- Start date.
- Assigned program, optional.

Step 3 — Baseline and consent

Optional measurements:

- Weight.
- Height.
- Body fat percentage.
- Waist.
- Chest.
- Hips.
- Other configurable measurements.

For every measurement, record the date and unit.

Include relevant training limitations and notes only when necessary, with appropriate privacy restrictions.

Capture consent for data processing and any separately required consent for progress photos or other sensitive data.

Consent must record the applicable notice/version, timestamp, status and source. Do not treat a generic checkbox as sufficient evidence for every consent purpose.

Step 4 — Review and create

- Review all entered fields.
- Highlight missing required information.
- Save draft.
- Create client.
- Optionally assign a workout plan.

Do not force optional measurements or optional personal information to be completed before the client can be created.

---

11. Workout Programs and Exercise Tracking

Exercise library

Each exercise may contain:

- Name.
- Instructions.
- Muscle groups.
- Equipment.
- Exercise category.
- Video or image URL.
- Difficulty level.
- Substitution suggestions.
- Safety notes.

Allow trainers to create custom exercises.

Program builder

Support:

- Program name and description.
- Goal.
- Duration.
- Weekly structure.
- Workout templates.
- Exercise ordering.
- Sets.
- Reps or time.
- Target weight.
- Rest interval.
- Tempo, optional.
- Trainer notes.
- Client-visible instructions.

Allow trainers to save templates and duplicate programs.

Client workout assignment

Assign programs to individual clients with:

- Start date.
- Planned schedule.
- Program status.
- Relevant instructions.
- Optional equipment and location notes.

Workout session tracking

Record:

- Planned exercises.
- Completed exercises.
- Set-by-set reps and load.
- Duration.
- Rest information where available.
- Exercise substitutions.
- Trainer feedback.
- Client feedback.
- Completion status.

Distinguish a planned workout from a completed workout.

Do not fabricate completion records or automatically mark sessions complete just because a client opens the screen.

Live workout experience

Provide a mobile-first interface with:

- Current exercise.
- Exercise demonstration.
- Sets, reps and weight.
- Completed-set indicators.
- Rest timer.
- Previous/next exercise.
- Session progress.
- Finish workout action.

Persist workout progress safely so a browser refresh does not silently lose a completed set.

---

12. Calendar and Scheduling

Build day, week and month views.

Support:

- Training sessions.
- Online coaching appointments.
- Trial sessions.
- Consultations.
- Rescheduling.
- Cancellation.
- Attendance.
- No-show tracking.

Every appointment must have a time zone, start time, duration, status and relevant relationship to a lead or client.

Use consistent conflict checking.

Avoid double-booking the trainer. Clearly differentiate prospect trials from active-client sessions.

Keep calendar records synchronized with lead details and client profiles.

---

13. Daily Client Check-ins

Make check-ins quick enough to complete in less than a minute.

Fields:

- Overall feeling: great, good, okay, tired or poor.
- Energy level: 1–10.
- Sleep quality: 1–10.
- Muscle soreness: none, mild, moderate or high.
- Optional notes.
- Optional workout feedback.

Include a clear submit action and confirmation.

Allow the trainer to see recent submissions and review notes in the trainer workspace.

Support configurable check-in frequency and optional reminders.

A check-in must belong to the correct client and date. Prevent accidental duplicate submissions where appropriate, while allowing an explicitly supported edit or correction workflow.

Do not diagnose health conditions from check-ins or imply that subjective ratings are medical assessments.

---

14. Progress Tracking

Measurements

Support dated records for:

- Weight.
- Height, when appropriate.
- Body fat percentage.
- Waist.
- Chest.
- Hips.
- Other configurable measurements.

Preserve historical values.

Never overwrite the previous measurement when a new measurement is recorded.

Charts

Provide readable trend charts with:

- Time range selection.
- Date-specific tooltips.
- Unit labels.
- Previous and current values.
- Change over time.
- Empty states when there is insufficient data.

Calculate changes from actual records and use consistent units.

Progress photos

Make photo tracking optional.

Store photos privately, use signed access URLs, enforce authorization and allow the trainer to control whether a photo is shared with the client.

Progress summaries

Show:

- Latest measurements.
- Workout consistency.
- Attendance.
- Goal progress.
- Recent milestones.
- Trainer feedback.

Avoid unsupported predictive scores and misleading percentage improvements.

---

15. Nutrition — Optional Module

Nutrition is secondary to the core MVP.

If included, allow trainers to record:

- General nutrition goals.
- Meal-plan entries.
- Food notes.
- Optional calorie and macronutrient targets.
- Client-visible instructions.

Make nutrition tracking configurable per client.

Do not present nutrition calculations as medical advice or prescribe clinical diets.

Do not block onboarding, workouts or progress tracking on nutrition configuration.

---

16. Messaging and Notifications

MVP messaging

Support:

- Click-to-chat WhatsApp links.
- Phone and email actions where available.
- Trainer-recorded communication activities.
- Internal follow-up notes.

Do not display a fake real-time chat system if no message backend exists.

Later messaging integration

Prepare for the official WhatsApp Business Platform, including authorized message templates, opt-in handling, webhook verification, delivery statuses and error reporting.

In-app notifications

Support useful notifications for:

- New lead submissions.
- Due follow-ups.
- Upcoming trial sessions.
- Client check-ins.
- Missed appointments.
- Workout completion events.

Implement only notification channels that are actually configured.

---

17. Database Architecture

Use Supabase PostgreSQL with UUID primary keys, foreign keys, timestamps, appropriate indexes and Row-Level Security.

Create normalized tables, including:

Identity and workspace

- "profiles"
- "trainer_settings"
- "trainer_availability"
- "client_memberships" or an equivalent trainer-client access relationship

Lead CRM

- "leads"
- "lead_activities"
- "lead_follow_ups"
- "lead_forms"
- "lead_consents"

Clients

- "clients"
- "client_goals"
- "client_consents"
- "client_notes"

Workouts

- "exercises"
- "workout_templates"
- "workout_template_exercises"
- "programs"
- "program_workouts"
- "program_exercises"
- "client_program_assignments"
- "workout_sessions"
- "workout_session_exercises"
- "workout_sets"

Scheduling

- "appointments"
- "appointment_participants", if required by the final model

Progress and check-ins

- "measurements"
- "check_ins"
- "progress_photos"
- "progress_shares"

Optional nutrition

- "nutrition_plans"
- "nutrition_plan_items"

Supporting features

- "notifications"
- "activity_events"
- "file_metadata"
- "audit_logs", for security-sensitive operations

Refine this schema to avoid unnecessary duplication. Use join tables where relationships require them.

Data ownership

Every trainer-owned record must have enforceable ownership.

Use "trainer_id" directly or derive ownership through a secure relationship. Ensure that nested resources such as sets, exercises, appointments, notes and files cannot bypass ownership restrictions.

Use database constraints for valid states and relationships where appropriate.

Data integrity

- Add indexes for common list filters and relationship lookups.
- Use transactions for multi-record operations.
- Use uniqueness constraints where appropriate.
- Handle duplicate leads.
- Preserve historical records.
- Validate foreign-key relationships.
- Prevent unauthorized cross-trainer access.

Provide versioned database migrations and a documented seed process.

---

18. Security, Privacy and Compliance

Treat client data as private by default.

Implement:

- Secure authentication.
- Server-side role and ownership checks.
- PostgreSQL RLS policies.
- Validated input schemas.
- Rate limiting on public endpoints.
- Spam protection for public forms.
- Secure environment variables.
- Private file buckets.
- Short-lived signed URLs for private files.
- Safe error messages.
- Audit logging for sensitive operations.
- Appropriate consent capture.
- Configurable retention and deletion workflows.
- Protection against unauthorized object access.
- No service-role keys in browser bundles.
- No sensitive data in public logs or analytics.

Public enquiry forms must never expose other leads or private client information.

A client must not be able to modify another client's check-ins, workouts, progress or appointments by changing an identifier.

Avoid claiming compliance certification without the required policies, processes and independent verification.

---

19. Application Architecture and Code Quality

Use a maintainable feature-oriented structure, for example:

- "app/" for routes and layouts.
- "components/" for reusable UI.
- "features/leads/"
- "features/clients/"
- "features/workouts/"
- "features/calendar/"
- "features/check-ins/"
- "features/progress/"
- "features/programs/"
- "lib/supabase/"
- "lib/validation/"
- "lib/permissions/"
- "lib/utils/"
- "types/"
- "supabase/migrations/"
- "tests/"

Adapt the structure to the actual repository rather than blindly creating duplicate conventions.

Requirements:

- Strict TypeScript.
- Reusable components.
- Centralized validation schemas.
- Consistent API and error-handling patterns.
- No "any" unless justified and isolated.
- No giant components containing the entire application.
- No duplicated business logic.
- No hardcoded production records.
- No fake success responses.
- No exposed secrets.
- No dead-end navigation.
- No placeholder buttons that pretend to work.

Use clear loading, error, empty, success and permission-denied states.

Use optimistic UI updates only when rollback and error handling are implemented.

---

20. Progressive Web App

The application must be mobile-first and installable as a PWA.

Implement:

- Web app manifest.
- Application icons and theme color.
- Installability.
- Responsive layouts.
- Appropriate mobile safe-area handling.
- Fast initial loading.
- Accessible touch targets.
- Offline-friendly app shell where appropriate.
- Graceful handling of poor connectivity.

Cache static assets where useful. Do not cache private client data indiscriminately.

Offline mutations must not be silently discarded. If offline workout logging is implemented, use a deliberate local queue and safe synchronization with conflict handling. Otherwise, show the user that the action requires a connection.

---

21. Application Routes

Create a coherent route structure. Adapt the exact paths to the chosen authentication approach.

Public

- "/"
- "/login"
- "/signup"
- "/forgot-password"
- "/coach/[slug]" — public enquiry page
- "/privacy"
- "/terms"

Trainer workspace

- "/app/dashboard"
- "/app/leads"
- "/app/leads/[id]"
- "/app/clients"
- "/app/clients/new"
- "/app/clients/[id]"
- "/app/calendar"
- "/app/programs"
- "/app/programs/[id]"
- "/app/workouts"
- "/app/check-ins"
- "/app/progress"
- "/app/messages"
- "/app/settings"

Client workspace

- "/client/home"
- "/client/workouts"
- "/client/workouts/[id]"
- "/client/check-in"
- "/client/progress"
- "/client/schedule"
- "/client/profile"

Use middleware and server-side authorization appropriately. Do not assume middleware alone is sufficient for database security.

---

22. Functional Requirements

Every major workflow must be genuinely connected.

Lead CRM

- Create, view, edit and filter leads.
- Change lead stages.
- Record activities.
- Schedule and complete follow-ups.
- Book and update trials.
- Attribute leads to sources.
- Share public enquiry links.
- Convert leads into clients without duplication.

Client management

- Create and edit clients.
- Save onboarding drafts.
- Archive and restore where permitted.
- View historical records.
- Assign training plans.

Workouts

- Create workout templates.
- Assign workouts.
- Record sets and repetitions.
- Complete workouts.
- Preserve workout history.

Scheduling

- Create appointments.
- Detect conflicts.
- Reschedule and cancel.
- Track attendance.
- Link trials to leads and sessions to clients.

Check-ins

- Submit client check-ins.
- View them in the trainer workspace.
- Prevent cross-client access.
- Record review status where needed.

Progress

- Add dated measurements.
- Display historical charts.
- Control sharing.
- Preserve previous records.

Global application

- Search.
- Notifications.
- Authentication.
- Permissions.
- Responsive navigation.
- Accessible forms.
- Useful empty states.
- Persistent database records.
- Audit-friendly activity history.

---

23. Performance and Reliability

Build for a trainer who has dozens of clients and could eventually have hundreds.

- Paginate larger lists.
- Filter and sort on the server when appropriate.
- Select only the columns required.
- Avoid unnecessary client-side data fetching.
- Prevent N+1 query patterns.
- Use database indexes.
- Optimize images.
- Avoid oversized JavaScript bundles.
- Handle API timeouts and failures.
- Make critical mutations idempotent.
- Use database transactions for conversion and other multi-record operations.

Do not sacrifice correctness for premature optimization.

---

24. Testing and Acceptance Criteria

Create unit, integration and end-to-end tests.

Authentication and authorization

- Trainer can only access their workspace.
- Clients can only access their own permitted records.
- Unauthorized users cannot access private routes.
- Cross-trainer record access is denied.
- Public enquiries cannot expose private data.

Lead CRM

- Valid leads can be created.
- Invalid forms show field-level errors.
- Duplicate contacts are handled safely.
- Search and filters work together.
- Follow-ups persist.
- Trials appear in Calendar.
- Trial conflicts are rejected.
- Conversion creates exactly one client.
- Lead history and source attribution are preserved.
- Failed conversion leaves records in a consistent state.

Client and workouts

- Client onboarding saves correctly.
- Optional fields can remain empty.
- Workout assignments persist.
- Completed sets are recorded correctly.
- Refreshing does not silently erase saved progress.
- Client access restrictions are enforced.

Progress and check-ins

- Measurements retain their historical dates.
- Charts reflect actual database values.
- Check-ins persist.
- Clients cannot edit another client's data.
- Private photos are not publicly accessible.

Quality gates

Before considering the build complete:

- TypeScript passes.
- Linting passes.
- Unit tests pass.
- Integration tests pass.
- Critical Playwright workflows pass.
- Production build succeeds.
- Database migrations apply successfully.
- RLS policies are verified.
- No critical navigation links are broken.
- No known critical security defects remain.

---

25. Deployment and Developer Documentation

Prepare the application for GitHub and Vercel deployment with Supabase as the backend.

Provide:

- ".env.example" containing placeholder variable names only.
- Supabase project setup instructions.
- Database migrations.
- Development seed data.
- Authentication setup.
- Storage bucket configuration.
- RLS policy documentation.
- Local development instructions.
- Build and test commands.
- Vercel deployment steps.
- Production environment-variable checklist.
- Public enquiry form configuration.
- Backup and recovery considerations.
- Troubleshooting guidance.

Never commit secrets or real client data.

Ensure the production build does not depend on local development data or developer-only shortcuts.

---

26. Implementation Plan

Build the application in the following order.

Phase 1 — Foundation

- Inspect the repository and existing implementation.
- Establish the design system.
- Configure Next.js, TypeScript and reusable UI components.
- Set up Supabase authentication and database access.
- Implement trainer/client authorization.
- Build the responsive application shell.

Phase 2 — Core trainer workflows

- Dashboard.
- Lead CRM.
- Public enquiry form.
- Lead detail drawer.
- Follow-ups.
- Trial booking.
- Client onboarding.
- Lead-to-client conversion.

Phase 3 — Coaching workflows

- Client management.
- Calendar.
- Exercise library.
- Program builder.
- Workout assignment.
- Workout execution and tracking.

Phase 4 — Monitoring client results

- Daily check-ins.
- Progress measurements.
- Charts.
- Progress sharing.
- Trainer review workflows.

Phase 5 — Polish and release

- PWA installability.
- Responsive refinements.
- Accessibility.
- Error handling.
- Testing.
- Security verification.
- Performance optimization.
- Deployment documentation.

Implement vertical slices: each feature should include its UI, validation, database changes, permissions and tests before being treated as complete.

---

27. Definition of Done

The MVP is complete when a trainer can perform the following journey without manual database edits:

1. Sign in securely.
2. Open the dashboard and see relevant daily actions.
3. Share a public enquiry page.
4. Receive an enquiry as a lead.
5. Review the lead and record contact activity.
6. Schedule a follow-up.
7. Book a trial without calendar conflicts.
8. Convert the prospect into a client without duplicate records.
9. Complete the Add Client onboarding flow.
10. Assign a workout program.
11. Record a client workout.
12. Receive a client check-in.
13. Add and review progress measurements.
14. View historical progress.
15. Control which progress information the client can access.
16. Use the application on desktop and mobile.
17. Refresh or sign in again without losing persisted records.
18. Respect all role, tenant and data-ownership restrictions.

The client must be able to access only their authorized experience, submit a check-in and view assigned workouts and explicitly shared progress.

---

28. Instructions for the AI Coding Agent

Start by inspecting the existing repository, package scripts, routes, components, environment configuration and database schema.

If a working implementation already exists, extend it instead of replacing it unnecessarily.

Then:

1. Summarize the existing architecture and identify missing requirements.
2. Create a concise implementation plan.
3. Establish the design tokens and application shell.
4. Build the core workflows in the specified order.
5. Implement real persistence and authorization.
6. Test each critical workflow.
7. Fix build errors and regressions.
8. Document configuration and deployment.

Do not stop after producing the plan. Continue implementing the application.

Do not create all screens as static mockups and call the product complete.

Do not use fictional metrics in production dashboards.

Do not bypass authentication or RLS to make a demo work.

Do not claim an external integration is active when credentials or webhooks are missing.

If a required secret is unavailable, implement the safe integration boundary and clearly document the remaining setup.

If scope must be reduced, preserve the essential end-to-end workflow: public lead capture → follow-up → trial → client conversion → onboarding → workout tracking → check-in → progress review.

Final objective

Deliver a cohesive, premium, secure and production-oriented FitCoach application that helps independent personal trainers grow their business and manage clients efficiently.

The interface should look like a world-class fitness SaaS product. The underlying workflows must be real, maintainable and testable.

Build the product, not merely the mockup.