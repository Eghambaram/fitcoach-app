import {
  addDays,
  daysBetween,
  isoWeekday,
  minutesOf,
  rangeLabel,
  step,
  timeLabel,
  viewRange,
  weekStart,
} from "./dates";

describe("calendar dates", () => {
  it("steps days across months and years without time-zone drift", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds Monday-based weeks", () => {
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("gives each view its range and paging", () => {
    expect(viewRange("week", "2026-10-23")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(viewRange("day", "2026-10-23")).toEqual({ from: "2026-10-23", to: "2026-10-23" });
    expect(viewRange("agenda", "2026-10-23")).toEqual({ from: "2026-10-23", to: "2026-11-05" });
    expect(step("week", "2026-10-23", -1)).toBe("2026-10-16");
    expect(daysBetween("2026-10-30", "2026-11-02")).toHaveLength(4);
  });

  it("formats times and ranges", () => {
    expect(timeLabel("00:15")).toBe("12:15 am");
    expect(timeLabel("12:00")).toBe("12:00 pm");
    expect(timeLabel("18:30")).toBe("6:30 pm");
    expect(minutesOf("07:45")).toBe(465);
    expect(rangeLabel("2026-10-19", "2026-10-25")).toMatch(/19 Oct – 25 Oct 2026/);
  });
});
