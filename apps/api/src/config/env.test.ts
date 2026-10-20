import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseEnv } from "./env";

const valid = {
  APP_ENV: "development",
  WEB_ORIGIN: "http://localhost:3000/",
  DATABASE_URL: "postgres://fitcoach_app:pw@localhost:5432/fitcoach",
  DATABASE_SYSTEM_URL: "postgres://fitcoach_system:pw@localhost:5432/fitcoach",
  IP_HASH_SALT: "0123456789abcdef",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  EMAIL_PROVIDER: "console",
  EMAIL_FROM: "FitCoach <noreply@fitcoach.local>",
};

function problemsFor(env: Record<string, string>): string[] {
  try {
    parseEnv(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigValidationError) return error.problems;
    throw error;
  }
}

describe("parseEnv", () => {
  it("applies defaults and normalises the web origin", () => {
    const config = parseEnv(valid);

    expect(config.port).toBe(4000);
    expect(config.dbPoolMax).toBe(10);
    expect(config.webOrigin).toBe("http://localhost:3000");
    expect(config.isProduction).toBe(false);
  });

  it("refuses to run request traffic as the owner role", () => {
    const problems = problemsFor({
      ...valid,
      DATABASE_URL: "postgres://postgres:pw@localhost:5432/fitcoach",
    });

    expect(problems).toEqual([
      expect.stringContaining("DATABASE_URL: must connect as fitcoach_app"),
    ]);
  });

  it("refuses a system URL that isn't the system role", () => {
    const problems = problemsFor({
      ...valid,
      DATABASE_SYSTEM_URL: "postgres://fitcoach_app:pw@localhost:5432/fitcoach",
    });

    expect(problems).toEqual([expect.stringContaining("DATABASE_SYSTEM_URL")]);
  });

  it("requires https and a long salt on staging and production", () => {
    const problems = problemsFor({ ...valid, APP_ENV: "production" });

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("WEB_ORIGIN: must be https"),
        expect.stringContaining("IP_HASH_SALT"),
      ]),
    );
  });
  it("requires the settings of the chosen email provider and forbids console email in production", () => {
    expect(problemsFor({ ...valid, EMAIL_PROVIDER: "smtp" })).toEqual([
      expect.stringContaining("SMTP_URL: is required"),
    ]);
    expect(problemsFor({ ...valid, EMAIL_PROVIDER: "resend" })).toEqual([
      expect.stringContaining("RESEND_API_KEY: is required"),
    ]);
    expect(problemsFor({ ...valid, APP_ENV: "production" })).toEqual(
      expect.arrayContaining([expect.stringContaining("EMAIL_PROVIDER: console is not allowed")]),
    );
  });

  it("uses Secure cookies only outside local development and tests", () => {
    expect(parseEnv(valid).secureCookies).toBe(false);
    expect(
      parseEnv({
        ...valid,
        APP_ENV: "staging",
        WEB_ORIGIN: "https://staging.example.com",
        IP_HASH_SALT: "0123456789abcdef0123456789abcdef",
      }).secureCookies,
    ).toBe(true);
  });

  it("reports missing variables by name without echoing values", () => {
    const problems = problemsFor({ DATABASE_URL: "postgres://secret-user:secret-pw@host/db" });

    expect(problems.join("\n")).toContain("WEB_ORIGIN");
    expect(problems.join("\n")).not.toContain("secret-pw");
  });
});
