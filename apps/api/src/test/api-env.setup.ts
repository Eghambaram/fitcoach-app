import { inject } from "vitest";

/** Points the API's config at the Testcontainers database before any test module boots the app. */
const db = inject("db");
const storage = inject("storage");

Object.assign(process.env, {
  APP_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: db.appUrl,
  DATABASE_SYSTEM_URL: db.systemUrl,
  DB_POOL_MAX: "4",
  IP_HASH_SALT: "test-ip-hash-salt-0123456789",
  SESSION_SECRET: "test-session-secret-0123456789abcdef",
  APP_ENCRYPTION_KEY: "dGVzdC1lbmNyeXB0aW9uLWtleS0wMTIzNDU2Nzg5YWI=",
  SIGNUP_MODE: "invite_code",
  EMAIL_PROVIDER: "console",
  EMAIL_FROM: "FitCoach <noreply@fitcoach.test>",
  STORAGE_ENDPOINT: storage.endpoint,
  STORAGE_REGION: "us-east-1",
  STORAGE_ACCESS_KEY_ID: storage.accessKeyId,
  STORAGE_SECRET_ACCESS_KEY: storage.secretAccessKey,
  STORAGE_PRIVATE_BUCKET: storage.privateBucket,
  STORAGE_PUBLIC_BUCKET: storage.publicBucket,
  STORAGE_PUBLIC_BASE_URL: `${storage.endpoint}/${storage.publicBucket}`,
  LOG_LEVEL: "silent",
});
