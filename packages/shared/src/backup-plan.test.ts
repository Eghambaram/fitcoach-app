import { describe, expect, it } from "vitest";
import { backupKeys, expiredKeys, localDay, safeError } from "./backup-plan";

describe("backup plan", () => {
  it("names the 02:00 IST run after the IST day, with a weekly copy on Sundays", () => {
    // 20:30 UTC Saturday = 02:00 IST Sunday.
    const sunday = new Date("2026-11-07T20:30:00Z");
    expect(localDay(sunday, "Asia/Kolkata")).toEqual({ date: "2026-11-08", weekday: 0 });
    expect(backupKeys(sunday, "Asia/Kolkata")).toEqual({
      date: "2026-11-08",
      daily: "backups/daily/2026-11-08.dump",
      weekly: "backups/weekly/2026-11-08.dump",
    });
    expect(backupKeys(new Date("2026-11-08T20:30:00Z"), "Asia/Kolkata", "pr-12/")).toEqual({
      date: "2026-11-09",
      daily: "pr-12/backups/daily/2026-11-09.dump",
      weekly: null,
    });
  });

  it("expires dailies after 7 days and weeklies after 28, and nothing else", () => {
    const keys = [
      "backups/daily/2026-11-09.dump",
      "backups/daily/2026-11-02.dump",
      "backups/daily/2026-11-01.dump",
      "backups/weekly/2026-10-12.dump",
      "backups/weekly/2026-10-11.dump",
      "backups/daily/notes.txt",
      "exports/abc/2026-01-01.zip",
    ];
    expect(expiredKeys(keys, "2026-11-09")).toEqual([
      "backups/daily/2026-11-01.dump",
      "backups/weekly/2026-10-11.dump",
    ]);
  });

  it("keeps credentials out of error messages", () => {
    expect(
      safeError(
        new Error("connect failed for postgresql://postgres:s3cret@db:5432/railway\nretry"),
      ),
    ).toBe("connect failed for <url> retry");
  });
});
