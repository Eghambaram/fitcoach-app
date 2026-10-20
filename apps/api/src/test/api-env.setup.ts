import { inject } from "vitest";

/** Points the API's config at the Testcontainers database before any test module boots the app. */
const db = inject("db");

Object.assign(process.env, {
  APP_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: db.appUrl,
  DATABASE_SYSTEM_URL: db.systemUrl,
  DB_POOL_MAX: "4",
  IP_HASH_SALT: "test-ip-hash-salt-0123456789",
  SESSION_SECRET: "test-session-secret-0123456789abcdef",
  SIGNUP_MODE: "invite_code",
  EMAIL_PROVIDER: "console",
  EMAIL_FROM: "FitCoach <noreply@fitcoach.test>",
  LOG_LEVEL: "silent",
});
