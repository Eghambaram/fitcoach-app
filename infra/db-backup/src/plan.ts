/**
 * Pure parts of the nightly backup (PROMPT §17.2): object keys and retention. Dates are calendar
 * days in the backup time zone (IST by default), so the 02:00 IST run is named after that day.
 */

export const DAILY_KEEP_DAYS = 7;
export const WEEKLY_KEEP_DAYS = 28;

export interface BackupKeys {
  /** Calendar date of the run, YYYY-MM-DD. */
  date: string;
  daily: string;
  /** Set on Sundays: the same dump is also kept as a weekly copy. */
  weekly: string | null;
}

/** YYYY-MM-DD and weekday (0 = Sunday) of `at` in `timeZone`. */
export function localDay(at: Date, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return { date: `${value("year")}-${value("month")}-${value("day")}`, weekday };
}

export function backupKeys(at: Date, timeZone: string, prefix = ""): BackupKeys {
  const { date, weekday } = localDay(at, timeZone);
  return {
    date,
    daily: `${prefix}backups/daily/${date}.dump`,
    weekly: weekday === 0 ? `${prefix}backups/weekly/${date}.dump` : null,
  };
}

const KEY_DATE = /backups\/(daily|weekly)\/(\d{4}-\d{2}-\d{2})\.dump$/;

/**
 * Keys past retention: dailies older than 7 days, weeklies older than 28 days (counted from
 * `today`). Unrecognised keys are never touched. The R2 lifecycle rules are the safety net.
 */
export function expiredKeys(keys: string[], today: string): string[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return keys.filter((key) => {
    const match = KEY_DATE.exec(key);
    if (!match?.[1] || !match[2]) return false;
    const ageDays = (todayMs - Date.parse(`${match[2]}T00:00:00Z`)) / 86_400_000;
    return ageDays > (match[1] === "daily" ? DAILY_KEEP_DAYS : WEEKLY_KEEP_DAYS);
  });
}

/** Error text for the heartbeat: short, single-line, with anything URL-like (credentials) removed. */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
