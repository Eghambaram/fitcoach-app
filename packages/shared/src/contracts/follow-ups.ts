import { z } from "zod";
import { MESSAGE_TEMPLATE_PURPOSES } from "../messaging";

/** Lead follow-ups and the communication log (PROMPT §8.2, §8.10, step 2.3). */

export const FOLLOW_UP_ACTIONS = [
  "whatsapp",
  "call",
  "email",
  "trial_confirmation",
  "package_discussion",
  "other",
] as const;
export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];

export const FOLLOW_UP_ACTION_LABELS: Record<FollowUpAction, string> = {
  whatsapp: "WhatsApp message",
  call: "Call",
  email: "Email",
  trial_confirmation: "Confirm trial",
  package_discussion: "Discuss packages",
  other: "Other",
};

export const FOLLOW_UP_STATUSES = ["open", "done", "skipped"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** `email` reminders are v1.1. In-app reminders are delivered by the notification jobs (step 5.2). */
export const FOLLOW_UP_REMINDERS = ["none", "in_app"] as const;
export type FollowUpReminder = (typeof FOLLOW_UP_REMINDERS)[number];

/** Overdue = due on an earlier day; today = due today. Days are in the workspace time zone. */
export const FOLLOW_UP_STATES = ["overdue", "today", "upcoming"] as const;
export type FollowUpState = (typeof FOLLOW_UP_STATES)[number];

export const CONTACT_CHANNELS = ["whatsapp", "call", "email", "in_person", "other"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  call: "Call",
  email: "Email",
  in_person: "In person",
  other: "Other",
};

export const CONTACT_OUTCOMES = [
  "message_sent",
  "spoke",
  "no_answer",
  "left_message",
  "replied",
  "other",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  message_sent: "Message sent",
  spoke: "Spoke with them",
  no_answer: "No answer",
  left_message: "Left a message",
  replied: "They replied",
  other: "Other",
};

/** The contact channel a follow-up action is done through, if it is a contact at all. */
export const FOLLOW_UP_ACTION_CHANNEL: Record<FollowUpAction, ContactChannel | null> = {
  whatsapp: "whatsapp",
  call: "call",
  email: "email",
  trial_confirmation: null,
  package_discussion: null,
  other: null,
};

export const FOLLOW_UP_NOTE_MAX = 500;
export const CONTACT_NOTE_MAX = 1000;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");
const optionalNote = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();

/**
 * Due date and time as the trainer picked them; the API reads them in the workspace time zone
 * (CLAUDE.md rule 19), so a trainer travelling with their laptop still gets the right day.
 */
export const followUpRequestSchema = z.object({
  actionType: z.enum(FOLLOW_UP_ACTIONS, "Choose what to do"),
  dueDate: localDate,
  dueTime: localTime,
  notes: optionalNote(FOLLOW_UP_NOTE_MAX),
  reminder: z.enum(FOLLOW_UP_REMINDERS).default("none"),
});
export type FollowUpRequest = z.infer<typeof followUpRequestSchema>;
export type FollowUpInput = z.input<typeof followUpRequestSchema>;

/** Completing needs an outcome; skipping doesn't. Either may schedule the next follow-up. */
export const completeFollowUpRequestSchema = z
  .object({
    status: z.enum(["done", "skipped"]),
    outcome: z.enum(CONTACT_OUTCOMES).optional(),
    outcomeNote: optionalNote(FOLLOW_UP_NOTE_MAX),
    /** Also write a communication log entry (only for WhatsApp, call and email follow-ups). */
    logContact: z.boolean().default(false),
    /** Which template was sent, when it was a WhatsApp message from the app. */
    templatePurpose: z.enum(MESSAGE_TEMPLATE_PURPOSES).optional(),
    next: followUpRequestSchema.optional(),
  })
  .refine((value) => value.status !== "done" || value.outcome !== undefined, {
    path: ["outcome"],
    message: "Choose how it went",
  });
export type CompleteFollowUpRequest = z.infer<typeof completeFollowUpRequestSchema>;
export type CompleteFollowUpInput = z.input<typeof completeFollowUpRequestSchema>;

/** "Log contact" (PROMPT §8.10): what happened, on which channel, with an optional note. */
export const logContactRequestSchema = z.object({
  channel: z.enum(CONTACT_CHANNELS, "Choose a channel"),
  outcome: z.enum(CONTACT_OUTCOMES, "Choose how it went"),
  note: optionalNote(CONTACT_NOTE_MAX),
  templatePurpose: z.enum(MESSAGE_TEMPLATE_PURPOSES).optional(),
});
export type LogContactRequest = z.infer<typeof logContactRequestSchema>;
export type LogContactInput = z.input<typeof logContactRequestSchema>;

export const leadFollowUpSchema = z.object({
  id: z.string().uuid(),
  actionType: z.enum(FOLLOW_UP_ACTIONS),
  dueAt: z.string().datetime(),
  /** The due day and time in the workspace time zone, for display. */
  dueDate: z.string().max(10),
  dueTime: z.string().max(5),
  status: z.enum(FOLLOW_UP_STATUSES),
  /** Only for open follow-ups. */
  state: z.enum(FOLLOW_UP_STATES).nullable(),
  notes: z.string().max(500).nullable(),
  reminder: z.enum(FOLLOW_UP_REMINDERS),
  outcome: z.enum(CONTACT_OUTCOMES).nullable(),
  outcomeNote: z.string().max(500).nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type LeadFollowUp = z.infer<typeof leadFollowUpSchema>;

/** A click-to-chat link, prefilled from a message template (CLAUDE.md rule 20d). */
export const whatsAppLinkSchema = z.object({
  purpose: z.enum(MESSAGE_TEMPLATE_PURPOSES),
  text: z.string(),
  url: z.string().url(),
});
export type WhatsAppLink = z.infer<typeof whatsAppLinkSchema>;
