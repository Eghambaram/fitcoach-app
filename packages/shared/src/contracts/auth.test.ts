import { describe, expect, it } from "vitest";
import { slugify } from "../slug";
import {
  loginRequestSchema,
  passwordSchema,
  signupRequestSchema,
  slugSchema,
  timezoneSchema,
} from "./auth";

const validSignup = {
  account: { email: "  Asha@Example.COM ", password: "a-long-unique-passphrase" },
  profile: { displayName: "Asha Rao", phone: "98765 43210" },
  business: {
    businessName: "Asha Fitness",
    slug: "asha-fitness",
    coachingModes: ["in_person", "online"],
  },
  inviteCode: "FIT-ABCD-EFGH",
  acceptTerms: true,
};

describe("signupRequestSchema", () => {
  it("accepts the three steps and normalises the email", () => {
    const parsed = signupRequestSchema.parse(validSignup);

    expect(parsed.account.email).toBe("asha@example.com");
    expect(parsed.business.timezone).toBe("Asia/Kolkata");
  });

  it("requires accepting the terms", () => {
    const result = signupRequestSchema.safeParse({ ...validSignup, acceptTerms: false });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone but allows leaving it out", () => {
    expect(
      signupRequestSchema.safeParse({
        ...validSignup,
        profile: { displayName: "Asha", phone: "123" },
      }).success,
    ).toBe(false);
    expect(
      signupRequestSchema.safeParse({ ...validSignup, profile: { displayName: "Asha" } }).success,
    ).toBe(true);
  });

  it("rejects an unknown time zone and empty coaching modes", () => {
    const result = signupRequestSchema.safeParse({
      ...validSignup,
      business: { ...validSignup.business, timezone: "Mars/Olympus", coachingModes: [] },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["business.timezone", "business.coachingModes"]),
      );
    }
  });
});

describe("timezoneSchema", () => {
  // Asia/Kolkata is our default but isn't ICU's canonical name, so it must be accepted explicitly.
  it.each([
    "Asia/Kolkata",
    "Asia/Calcutta",
    "Europe/London",
    "America/Argentina/Buenos_Aires",
    "UTC",
  ])("accepts %s", (zone) => {
    expect(timezoneSchema.safeParse(zone).success).toBe(true);
  });

  it.each(["+05:30", "Mars/Olympus", "asia/kolkata", ""])("rejects %j", (zone) => {
    expect(timezoneSchema.safeParse(zone).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it.each(["short", "password123", "1234567890", "aaaaaaaaaaaa"])("rejects %j", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });

  it("accepts a long uncommon passphrase", () => {
    expect(passwordSchema.safeParse("correct horse battery").success).toBe(true);
  });
});

describe("slugSchema", () => {
  it.each(["ab", "Has Spaces", "double--hyphen", "-leading", "admin", "fitcoach"])(
    "rejects %j",
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it("accepts a normal slug", () => {
    expect(slugSchema.parse("asha-fitness-2")).toBe("asha-fitness-2");
  });

  it("can always validate what slugify suggests for a reasonable name", () => {
    expect(slugSchema.safeParse(slugify("Asha’s Fitness Studio — Pune")).success).toBe(true);
    expect(slugify("Asha’s Fitness Studio — Pune")).toBe("ashas-fitness-studio-pune");
  });
});

describe("loginRequestSchema", () => {
  it("doesn't apply password strength rules at login", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});
