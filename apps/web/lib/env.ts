import { z } from "zod";

/**
 * Server-side env for the web app (PROMPT §12.1). Read lazily, at request time — never during
 * `next build` (private networking isn't available then, PROMPT §4.2).
 */
const serverEnvSchema = z.object({
  /** The API over Railway private networking (locally http://localhost:4000). Never sent to browsers. */
  API_INTERNAL_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  /** Build-time: where "Request beta access" emails go (ADR-0061). Empty when the build arg is unset. */
  NEXT_PUBLIC_BETA_CONTACT_EMAIL: z.union([z.literal(""), z.string().email()]).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Public variables are inlined into the browser bundle, so they must never hold secrets (CLAUDE.md rule 13). */
const SECRET_LIKE = /(SECRET|PASSWORD|PRIVATE|TOKEN|API_KEY|DATABASE|_DSN$)/;
const ALLOWED_PUBLIC = new Set(["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_SENTRY_DSN"]);

export function findSecretLikePublicVars(source: Record<string, string | undefined>): string[] {
  return Object.keys(source).filter(
    (name) =>
      name.startsWith("NEXT_PUBLIC_") && !ALLOWED_PUBLIC.has(name) && SECRET_LIKE.test(name),
  );
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const leaked = findSecretLikePublicVars(source);
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to start: secret-looking public variables ${leaked.join(", ")} (NEXT_PUBLIC_* reaches the browser)`,
    );
  }
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid web configuration: ${names} (see .env.example)`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
