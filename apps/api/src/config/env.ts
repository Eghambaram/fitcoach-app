import { z } from "zod";

export const APP_ENVS = ["development", "test", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

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
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  })
  .superRefine((env, ctx) => {
    const role = (url: string) => decodeURIComponent(new URL(url).username);

    if (role(env.DATABASE_URL) !== APP_ROLE) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: `must connect as ${APP_ROLE} (the role without BYPASSRLS)`,
      });
    }
    if (role(env.DATABASE_SYSTEM_URL) !== SYSTEM_ROLE) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_SYSTEM_URL"],
        message: `must connect as ${SYSTEM_ROLE}`,
      });
    }

    const deployed = env.APP_ENV === "staging" || env.APP_ENV === "production";
    if (deployed && new URL(env.WEB_ORIGIN).protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "must be https outside local development",
      });
    }
    if (deployed && env.IP_HASH_SALT.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["IP_HASH_SALT"],
        message: "must be at least 32 random characters outside local development",
      });
    }
  });

/** Validated API configuration. Injected by type: `constructor(private readonly config: AppConfig)`. */
export abstract class AppConfig {
  abstract readonly appEnv: AppEnv;
  abstract readonly isProduction: boolean;
  abstract readonly port: number;
  /** Exact origin of the web app, without a trailing slash (CSRF checks, PROMPT §12.2). */
  abstract readonly webOrigin: string;
  abstract readonly databaseUrl: string;
  abstract readonly databaseSystemUrl: string;
  abstract readonly dbPoolMax: number;
  abstract readonly ipHashSalt: string;
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
    logLevel: env.LOG_LEVEL,
  };
}
