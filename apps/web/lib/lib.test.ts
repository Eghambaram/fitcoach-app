import { describe, expect, it } from "vitest";
import { describeDevice } from "@/features/settings/sessions-list";
import { firstName, greeting } from "@/features/dashboard/greeting";
import {
  CLIENT_NAV,
  isActive,
  PLATFORM_NAV,
  TRAINER_BOTTOM_NAV,
  TRAINER_MORE_NAV,
  TRAINER_NAV,
} from "@/features/shell/navigation";
import { toApiRequestError } from "./api/errors";
import { findSecretLikePublicVars, parseServerEnv } from "./env";
import { safeNextPath } from "./safe-redirect";

describe("navigation (PROMPT §6)", () => {
  it("has exactly the MVP trainer items, in order", () => {
    expect(TRAINER_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Leads",
      "Clients",
      "Calendar",
      "Programs",
      "Workouts",
      "Check-ins",
      "Progress",
      "Settings",
    ]);
  });

  it("never lists features cut from the MVP", () => {
    const labels = [...TRAINER_NAV, ...TRAINER_MORE_NAV, ...CLIENT_NAV, ...PLATFORM_NAV].map(
      (item) => item.label,
    );
    for (const cut of [
      "Nutrition",
      "Messages",
      "Billing",
      "Templates",
      "Subscriptions",
      "Analytics",
      "Announcements",
    ]) {
      expect(labels).not.toContain(cut);
    }
  });

  it("uses Home · Leads · Clients · Calendar (+ More) on the trainer bottom nav", () => {
    expect(TRAINER_BOTTOM_NAV.map((item) => item.label)).toEqual([
      "Home",
      "Leads",
      "Clients",
      "Calendar",
    ]);
  });

  it("uses Home · Workouts · Progress · Check-in (+ More) for clients", () => {
    expect(CLIENT_NAV.map((item) => item.label)).toEqual([
      "Home",
      "Workouts",
      "Progress",
      "Check-in",
    ]);
  });

  it("only marks screens that exist as available", () => {
    expect(TRAINER_NAV.filter((item) => item.available).map((item) => item.href)).toEqual([
      "/app/dashboard",
      "/app/leads",
      "/app/clients",
      "/app/calendar",
      "/app/programs",
      "/app/check-ins",
      "/app/progress",
      "/app/settings",
    ]);
  });

  it("matches nested routes but not prefixes of other words", () => {
    expect(isActive("/app/settings/security", "/app/settings")).toBe(true);
    expect(isActive("/app/settingsx", "/app/settings")).toBe(false);
    expect(isActive("/platform/trainers", "/platform")).toBe(false);
    expect(isActive("/app/exercises", "/app/programs")).toBe(true);
    expect(isActive("/app/exercises", "/app/clients")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/app/leads?stage=new", "/app/leads?stage=new"],
    [undefined, "/app/dashboard"],
    ["//evil.example", "/app/dashboard"],
    ["https://evil.example/app", "/app/dashboard"],
    ["/\\evil.example", "/app/dashboard"],
    ["javascript:alert(1)", "/app/dashboard"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("web env", () => {
  it("refuses secret-looking NEXT_PUBLIC variables", () => {
    expect(
      findSecretLikePublicVars({
        NEXT_PUBLIC_API_KEY: "x",
        NEXT_PUBLIC_SITE_URL: "y",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "z",
      }),
    ).toEqual(["NEXT_PUBLIC_API_KEY"]);
    expect(() =>
      parseServerEnv({ API_INTERNAL_URL: "http://api:4000", NEXT_PUBLIC_SESSION_SECRET: "oops" }),
    ).toThrow(/secret-looking/);
  });

  it("requires the internal API URL", () => {
    expect(() => parseServerEnv({})).toThrow(/API_INTERNAL_URL/);
    expect(parseServerEnv({ API_INTERNAL_URL: "http://localhost:4000" }).NEXT_PUBLIC_APP_ENV).toBe(
      "development",
    );
  });
});

describe("toApiRequestError", () => {
  it("keeps the API's error contract", () => {
    const error = toApiRequestError(409, {
      code: "CONFLICT_DUPLICATE",
      message: "Taken",
      requestId: "r1",
    });

    expect(error.code).toBe("CONFLICT_DUPLICATE");
    expect(error.message).toBe("Taken");
  });

  it("explains an unreachable server differently from a broken response", () => {
    expect(toApiRequestError(0, undefined).message).toMatch(/couldn't reach/);
    expect(toApiRequestError(502, "<html>").message).toMatch(/on our side/);
  });
});

describe("dashboard greeting", () => {
  it("greets in the workspace time zone, not the server's", () => {
    const utcMidnight = new Date("2026-10-20T00:30:00Z"); // 06:00 in India
    expect(greeting(utcMidnight, "Asia/Kolkata")).toBe("Good morning");
    expect(greeting(utcMidnight, "America/New_York")).toBe("Good evening");
  });

  it("uses the first name", () => {
    expect(firstName("  Asha  Rao ")).toBe("Asha");
  });
});

describe("describeDevice", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "Chrome on Android",
      true,
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
      "Edge on Windows",
      false,
    ],
    [null, "Unknown device", false],
  ])("%s → %s", (userAgent, label, mobile) => {
    expect(describeDevice(userAgent)).toEqual({ label, mobile });
  });
});
