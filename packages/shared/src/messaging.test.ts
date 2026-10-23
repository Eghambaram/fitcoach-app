import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, findUnknownPlaceholders, firstName, renderTemplate } from "./messaging";

describe("WhatsApp click-to-chat", () => {
  it("uses the E.164 digits without + and URL-encodes the whole message", () => {
    expect(buildWhatsAppUrl("+919812345678", "Hi Meena! 50% off & a trial? #fit")).toBe(
      "https://wa.me/919812345678?text=Hi%20Meena!%2050%25%20off%20%26%20a%20trial%3F%20%23fit",
    );
  });

  it("opens a plain chat when there's no text", () => {
    expect(buildWhatsAppUrl("+919812345678", "")).toBe("https://wa.me/919812345678");
  });

  it("encodes line breaks and non-Latin text", () => {
    const url = buildWhatsAppUrl("+919812345678", "नमस्ते\nSee you");
    expect(decodeURIComponent(url.split("?text=")[1] ?? "")).toBe("नमस्ते\nSee you");
    expect(url).not.toMatch(/\s/);
  });
});

describe("templates", () => {
  it("fills known placeholders and leaves missing ones visible", () => {
    expect(
      renderTemplate("Hi {first_name}, {trainer_name} here. {date} at {time}?", {
        first_name: "Meena",
        trainer_name: "Arjun",
      }),
    ).toBe("Hi Meena, Arjun here. {date} at {time}?");
  });

  it("flags unknown placeholders", () => {
    expect(findUnknownPlaceholders("Hi {name} {first_name} {First_Name}")).toEqual([
      "{name}",
      "{First_Name}",
    ]);
  });

  it("takes the first word of a name", () => {
    expect(firstName("  Meena  Singh ")).toBe("Meena");
    expect(firstName("Ravi")).toBe("Ravi");
  });
});
