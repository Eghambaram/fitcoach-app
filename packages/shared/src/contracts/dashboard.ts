import { z } from "zod";
import { ATTENTION_KINDS } from "../metrics";
import { CLIENT_ACTIVITY_TYPES } from "./clients";
import { whatsAppLinkSchema } from "./follow-ups";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES } from "./scheduling";

/** Trainer dashboard (PROMPT §8.1, step 5.1). */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dashboardQuerySchema = z.object({
  /** The day shown in "Today's schedule" (prev/next day); KPIs are always for today. */
  date: isoDate.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const FIRST_RUN_STEPS = ["public_page", "first_person", "program", "invite"] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

export const dashboardAppointmentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(APPOINTMENT_KINDS),
  status: z.enum(APPOINTMENT_STATUSES),
  startsAt: z.string().datetime(),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  durationMin: z.number().int(),
  person: z.object({
    kind: z.enum(["client", "lead"]),
    id: z.string().uuid(),
    fullName: z.string().max(80),
  }),
  location: z.string().max(120).nullable(),
  meetingUrl: z.string().max(300).nullable(),
  started: z.boolean(),
  ended: z.boolean(),
  /** The client's workout planned for that day, for "Start". */
  workoutSessionId: z.string().uuid().nullable(),
});
export type DashboardAppointment = z.infer<typeof dashboardAppointmentSchema>;

export const attentionItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(120),
  detail: z.string().max(200),
  href: z.string().max(300),
  /** Payment and package reminders: click-to-chat with the template (nothing is sent by the app). */
  whatsApp: whatsAppLinkSchema.nullable(),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

export const dashboardSummarySchema = z.object({
  /** Today in the workspace time zone, and the day the schedule shows. */
  today: isoDate,
  date: isoDate,
  timezone: z.string().max(64),
  kpis: z.object({
    sessions: z.object({
      total: z.number().int(),
      inPerson: z.number().int(),
      online: z.number().int(),
      trials: z.number().int(),
    }),
    activeClients: z.number().int(),
    newLeads: z.number().int(),
    followUps: z.object({ due: z.number().int(), overdue: z.number().int() }),
    checkInsToReview: z.number().int(),
    paymentsDue: z.number().int(),
    packagesExpiring: z.number().int(),
  }),
  schedule: z.array(dashboardAppointmentSchema),
  /** Non-empty groups only, in the order of §8.1. */
  attention: z.array(
    z.object({
      kind: z.enum(ATTENTION_KINDS),
      count: z.number().int(),
      items: z.array(attentionItemSchema),
      href: z.string().max(300),
    }),
  ),
  activity: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.enum(CLIENT_ACTIVITY_TYPES),
      data: z.record(z.string(), z.unknown()),
      createdAt: z.string().datetime(),
      client: z.object({ id: z.string().uuid(), fullName: z.string().max(80) }).nullable(),
    }),
  ),
  checklist: z.object({
    /** Shown until every step is done or the trainer dismisses it. */
    visible: z.boolean(),
    steps: z.array(z.object({ key: z.enum(FIRST_RUN_STEPS), done: z.boolean() })),
  }),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
