import { type ClientActivityType, formatInr } from "@fitcoach/shared";
import { dayLabel, timeLabel } from "../calendar/dates";

/** Plain-language line for a client activity event (client profile, dashboard). */
export function describeActivity(entry: {
  type: ClientActivityType;
  data: Record<string, unknown>;
}): string {
  const data = entry.data;
  const reason = typeof data.reason === "string" ? `: ${data.reason}` : "";
  switch (entry.type) {
    case "lead_converted":
      return data.linked ? "Linked from a new enquiry" : "Converted from a lead";
    case "client_onboarded":
      return "Onboarding completed";
    case "client_paused":
      return `Paused${reason}`;
    case "client_resumed":
      return "Resumed";
    case "client_archived":
      return `Archived${reason}`;
    case "client_restored":
      return "Restored from the archive";
    case "package_sold":
      return `${data.renewal ? "Renewed with" : "Sold"} ${String(data.packageName ?? "a package")}`;
    case "package_cancelled":
      return `Cancelled ${String(data.packageName ?? "a package")}${reason}`;
    case "payment_recorded":
      return `Payment of ${typeof data.amountPaise === "number" ? formatInr(data.amountPaise) : "money"} recorded`;
    case "payment_voided":
      return `Payment of ${typeof data.amountPaise === "number" ? formatInr(data.amountPaise) : "money"} voided${reason}`;
    case "sessions_adjusted": {
      const count = typeof data.sessions === "number" ? data.sessions : 0;
      const sessions = `${Math.abs(count)} session${Math.abs(count) === 1 ? "" : "s"}`;
      return count > 0 ? `${sessions} used by hand` : `${sessions} given back`;
    }
    case "session_attended":
    case "session_no_show": {
      const when =
        typeof data.date === "string" && typeof data.startTime === "string"
          ? ` on ${dayLabel(data.date)}, ${timeLabel(data.startTime)}`
          : "";
      return `${entry.type === "session_attended" ? "Attended" : "Missed"} a session${when}`;
    }
  }
}
