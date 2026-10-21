import { describe, expect, it } from "vitest";
import { findUnknownPlaceholders, renderTemplate } from "../messaging";
import { enquiryRequestSchema } from "./public-page";
import {
  changePasswordRequestSchema,
  messageTemplateBodySchema,
  packagePresetInputSchema,
  publicPageSettingsRequestSchema,
} from "./settings";

describe("message templates", () => {
  it("accepts only the known placeholders", () => {
    expect(findUnknownPlaceholders("Hi {first_name}, see you {date} at {time}")).toEqual([]);
    expect(findUnknownPlaceholders("Hi {name} and {First_Name} and {name}")).toEqual([
      "{name}",
      "{First_Name}",
    ]);
    expect(findUnknownPlaceholders("Empty {} braces")).toEqual(["{}"]);
  });

  it("refuses a body with an unknown placeholder, naming it", () => {
    const result = messageTemplateBodySchema.safeParse("Hi {nickname}!");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Unknown placeholder: {nickname}");
  });

  it("fills known values and leaves missing ones visible", () => {
    expect(renderTemplate("Hi {first_name}, {sessions_left} left", { first_name: "Asha" })).toBe(
      "Hi Asha, {sessions_left} left",
    );
  });
});

describe("public page settings", () => {
  const valid = {
    displayName: "Asha Rao",
    businessName: "Asha Fitness",
    slug: "asha-fitness",
    coachingTypes: ["Strength", "Mobility"],
    coachingModes: ["online"],
    form: { email: "optional", schedule: true, message: false, consentText: "x".repeat(30) },
  };

  it("defaults optional text to empty and rejects duplicate coaching types", () => {
    const parsed = publicPageSettingsRequestSchema.parse(valid);
    expect(parsed.headline).toBe("");
    expect(
      publicPageSettingsRequestSchema.safeParse({ ...valid, coachingTypes: ["Yoga", "yoga"] })
        .success,
    ).toBe(false);
  });

  it("refuses reserved slugs", () => {
    expect(publicPageSettingsRequestSchema.safeParse({ ...valid, slug: "admin" }).success).toBe(
      false,
    );
  });
});

describe("enquiry form", () => {
  const valid = {
    slug: "asha-fitness",
    fullName: "Ravi",
    phone: "98765 43210",
    goal: "get_stronger",
    consent: true,
    consentVersion: 1,
    formToken: "t",
  };

  it("treats an unknown ?src= as the plain enquiry page", () => {
    expect(enquiryRequestSchema.parse({ ...valid, source: "tiktok" }).source).toBe("public_page");
    expect(enquiryRequestSchema.parse({ ...valid, source: "instagram" }).source).toBe("instagram");
    expect(enquiryRequestSchema.parse(valid).source).toBe("public_page");
  });

  it("accepts no training-mode preference (an untouched radio group is null)", () => {
    expect(enquiryRequestSchema.safeParse({ ...valid, preferredMode: null }).success).toBe(true);
  });

  it("requires consent and a valid phone", () => {
    expect(enquiryRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
  });
});

describe("package presets", () => {
  it("needs sessions for a session pack and caps the price", () => {
    const base = {
      name: "10 sessions",
      kind: "session_pack",
      sessionsIncluded: null,
      durationDays: 60,
      sessionsPerWeek: null,
      defaultPricePaise: 500_000,
    };
    expect(packagePresetInputSchema.safeParse(base).success).toBe(false);
    expect(packagePresetInputSchema.safeParse({ ...base, sessionsIncluded: 10 }).success).toBe(
      true,
    );
    expect(
      packagePresetInputSchema.safeParse({
        ...base,
        sessionsIncluded: 10,
        defaultPricePaise: 1_000_000_000,
      }).success,
    ).toBe(false);
  });
});

describe("change password", () => {
  it("refuses reusing the current password", () => {
    const result = changePasswordRequestSchema.safeParse({
      currentPassword: "a-long-passphrase-1",
      newPassword: "a-long-passphrase-1",
    });
    expect(result.success).toBe(false);
  });
});
