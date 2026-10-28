import { z } from "zod";

/** Beta readiness (step 5.3): feedback and data export. */

export const FEEDBACK_MESSAGE_MAX = 2000;

/** "Send feedback" (PROMPT §16.0): the page it was sent from is attached; no screenshots in MVP. */
export const feedbackRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(3, "Tell us a little more")
    .max(FEEDBACK_MESSAGE_MAX, `Use at most ${FEEDBACK_MESSAGE_MAX} characters`),
  /** An in-app path such as `/app/clients`; never a full URL or query string. */
  page: z
    .string()
    .max(200)
    .regex(/^\/[A-Za-z0-9/_\-[\]]*$/, "A page path")
    .optional(),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const EXPORT_STATUSES = ["pending", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];
/** Hours a finished export stays downloadable (§8.12). */
export const EXPORT_AVAILABLE_HOURS = 24;
/** What the zip holds, one CSV each (§8.12). */
export const EXPORT_FILES = [
  "leads",
  "clients",
  "appointments",
  "packages",
  "payments",
  "measurements",
] as const;

export const dataExportSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(EXPORT_STATUSES),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  /** Downloadable until then. */
  expiresAt: z.string().datetime().nullable(),
  sizeBytes: z.number().int().nullable(),
});
export type DataExport = z.infer<typeof dataExportSchema>;

export const dataExportListResponseSchema = z.object({
  /** Object storage is set up; without it exports can't be made. */
  available: z.boolean(),
  exports: z.array(dataExportSchema),
});
export type DataExportListResponse = z.infer<typeof dataExportListResponseSchema>;
