import { z } from "zod";

/** In-app notifications (PROMPT §8.10, step 5.2). Nothing here claims a message was delivered. */

export const NOTIFICATION_TYPES = [
  "new_lead",
  "follow_up_due",
  "trial_soon",
  "attendance_needed",
  "package_expiring",
  "package_low",
  "payment_due",
  "check_in_submitted",
  "invite_accepted",
  "program_assigned",
  "session_booked",
  "session_changed",
  "session_cancelled",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PAGE_SIZE = 30;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().max(160),
  body: z.string().max(500).nullable(),
  /** In-app path to open, e.g. `/app/leads/<id>`. */
  link: z.string().max(300).nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
