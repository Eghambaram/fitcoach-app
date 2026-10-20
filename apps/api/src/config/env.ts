import { SIGNUP_MODES, type SignupMode } from "@fitcoach/shared";
import { z } from "zod";

export const APP_ENVS = ["development", "test", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
const EMAIL_PROVIDERS = ["smtp", "resend", "console"] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

/** Request traffic must use the non-owner roles (PROMPT §4.5); the owner URL is only for migrations. */
const APP_ROLE = "fitcoach_app";
const SYSTEM_ROLE = "fitcoach_system";

const postgresUrl = z
  .string()
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

const envSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVS).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.string().url(),
    DATABASE_URL: postgresUrl,
    DATABASE_SYSTEM_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    IP_HASH_SALT: z.string().min(16),
    /** Keys the HMAC of session, auth and invite tokens (a DB leak alone can't be replayed). */
    SESSION_SECRET: z.string().min(32),
    SIGNUP_MODE: z.enum(SIGNUP_MODES).default("invite_code"),
    BETA_DEFAULT_CLIENT_LIMIT: z.coerce.number().int().min(1).max(10_000).default(50),
    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).default("smtp"),
    EMAIL_FROM: z.string().min(3),
    SMTP_URL: z.string().url().optional(),
    RESEND_API_KEY: z.string().min(10).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  })
  .superRefine((env, ctx) => {
    const role = (url: string) => decodeURIComponent(new URL(url).username);
    const problem = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (role(env.DATABASE_URL) !== APP_ROLE) {
      problem("DATABASE_URL", `must connect as ${APP_ROLE} (the role without BYPASSRLS)`);
    }
    if (role(env.DATABASE_SYSTEM_URL) !== SYSTEM_ROLE) {
      problem("DATABASE_SYSTEM_URL", `must connect as ${SYSTEM_ROLE}`);
    }

    if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_URL) {
      problem("SMTP_URL", "is required when EMAIL_PROVIDER=smtp");
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      problem("RESEND_API_KEY", "is required when EMAIL_PROVIDER=resend");
    }

    const deployed = env.APP_ENV === "staging" || env.APP_ENV === "production";
    if (deployed && new URL(env.WEB_ORIGIN).protocol !== "https:") {
      problem("WEB_ORIGIN", "must be https outside local development");
    }
    if (deployed && env.IP_HASH_SALT.length < 32) {
      problem("IP_HASH_SALT", "must be at least 32 random characters outside local development");
    }
    if (env.APP_ENV === "production" && env.EMAIL_PROVIDER === "console") {
      problem("EMAIL_PROVIDER", "console is not allowed in production (D13)");
    }
  });

/** Validated API configuration. Injected by type: `constructor(private readonly config: AppConfig)`. */
export abstract class AppConfig {
  abstract readonly appEnv: AppEnv;
  abstract readonly isProduction: boolean;
  abstract readonly port: number;
  /** Exact origin of the web app, without a trailing slash (CSRF checks, email links). */
  abstract readonly webOrigin: string;
  abstract readonly databaseUrl: string;
  abstract readonly databaseSystemUrl: string;
  abstract readonly dbPoolMax: number;
  abstract readonly ipHashSalt: string;
  abstract readonly sessionSecret: string;
  /** `Secure` session cookies everywhere except local development and tests (PROMPT §12.2). */
  abstract readonly secureCookies: boolean;
  abstract readonly signupMode: SignupMode;
  abstract readonly betaDefaultClientLimit: number;
  abstract readonly email: {
    readonly provider: EmailProviderName;
    readonly from: string;
    readonly smtpUrl?: string;
    readonly resendApiKey?: string;
  };
  abstract readonly logLevel: (typeof LOG_LEVELS)[number];
}

export class ConfigValidationError extends Error {
  constructor(readonly problems: string[]) {
    // Only variable names and rules — never values, which may be secrets.
    super(`Invalid API configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(env)"}: ${issue.message}`),
    );
  }
  const env = result.data;
  return {
    appEnv: env.APP_ENV,
    isProduction: env.APP_ENV === "production",
    port: env.PORT,
    webOrigin: new URL(env.WEB_ORIGIN).origin,
    databaseUrl: env.DATABASE_URL,
    databaseSystemUrl: env.DATABASE_SYSTEM_URL,
    dbPoolMax: env.DB_POOL_MAX,
    ipHashSalt: env.IP_HASH_SALT,
    sessionSecret: env.SESSION_SECRET,
    secureCookies: env.APP_ENV === "staging" || env.APP_ENV === "production",
    signupMode: env.SIGNUP_MODE,
    betaDefaultClientLimit: env.BETA_DEFAULT_CLIENT_LIMIT,
    email: {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      smtpUrl: env.SMTP_URL,
      resendApiKey: env.RESEND_API_KEY,
    },
    logLevel: env.LOG_LEVEL,
  };
}
