import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseEnv } from "./env";

const valid = {
  APP_ENV: "development",
  WEB_ORIGIN: "http://localhost:3000/",
  DATABASE_URL: "postgres://fitcoach_app:pw@localhost:5432/fitcoach",
  DATABASE_SYSTEM_URL: "postgres://fitcoach_system:pw@localhost:5432/fitcoach",
  IP_HASH_SALT: "0123456789abcdef",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
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
  it("needs a 32-byte encryption key, and not the local one when deployed", () => {
    expect(parseEnv(valid).encryptionKey).toHaveLength(32);
    expect(problemsFor({ ...valid, APP_ENCRYPTION_KEY: "c2hvcnQ=" })).toEqual([
      expect.stringContaining("APP_ENCRYPTION_KEY: must be 32 random bytes"),
    ]);
    expect(
      problemsFor({
        ...valid,
        APP_ENV: "staging",
        WEB_ORIGIN: "https://staging.example.com",
        IP_HASH_SALT: "0123456789abcdef0123456789abcdef",
        APP_ENCRYPTION_KEY: "bG9jYWwtZGV2LWVuY3J5cHRpb24ta2V5LW5vdC1zZWM=",
      }),
    ).toEqual([expect.stringContaining("APP_ENCRYPTION_KEY: must not be the local")]);
  });

  it("needs R2 on its custom domain and a nightly backup in production", () => {
    const production = {
      ...valid,
      APP_ENV: "production",
      WEB_ORIGIN: "https://app.example.com",
      IP_HASH_SALT: "0123456789abcdef0123456789abcdef",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_0123456789",
    };
    expect(problemsFor(production)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("STORAGE_ENDPOINT: object storage is required in production"),
        expect.stringContaining("DATABASE_OWNER_URL: is required with NIGHTLY_BACKUP=in_api"),
      ]),
    );
    const storage = {
      STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      STORAGE_ACCESS_KEY_ID: "key",
      STORAGE_SECRET_ACCESS_KEY: "secret",
      STORAGE_PRIVATE_BUCKET: "fitcoach-prod-private",
      STORAGE_PUBLIC_BUCKET: "fitcoach-prod-public",
      STORAGE_PUBLIC_BASE_URL: "https://pub-0123.r2.dev",
    };
    const heartbeat = { DATABASE_OWNER_URL: "postgres://postgres:pw@localhost:5432/fitcoach" };
    expect(problemsFor({ ...production, ...storage, ...heartbeat })).toEqual([
      expect.stringContaining("STORAGE_PUBLIC_BASE_URL: must be the media custom domain"),
    ]);
    const config = parseEnv({
      ...production,
      ...storage,
      ...heartbeat,
      STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
    });
    expect(config.isProduction).toBe(true);
    expect(config.secureCookies).toBe(true);
    expect(config.nightlyBackup).toBe("in_api");
    expect(config.databaseOwnerUrl).toBe(heartbeat.DATABASE_OWNER_URL);
    // With the separate db-backup service, its heartbeat token is required instead; off is refused.
    const base = {
      ...production,
      ...storage,
      STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
    };
    expect(problemsFor({ ...base, NIGHTLY_BACKUP: "external" })).toEqual([
      expect.stringContaining("BACKUP_HEARTBEAT_TOKEN: is required with NIGHTLY_BACKUP=external"),
    ]);
    expect(problemsFor({ ...base, NIGHTLY_BACKUP: "off" })).toEqual([
      expect.stringContaining("NIGHTLY_BACKUP: can't be off in production"),
    ]);
    // Staging may use r2.dev and run without the heartbeat.
    expect(
      problemsFor({
        ...production,
        ...storage,
        APP_ENV: "staging",
        WEB_ORIGIN: "https://staging.example.com",
      }),
    ).toEqual([]);
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
