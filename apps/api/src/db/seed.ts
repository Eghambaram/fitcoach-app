/**
 * `pnpm db:seed` — demo data for LOCAL development only (PROMPT §10.6). Refuses outside development.
 * Idempotent. Production reference data lives in migrations, never here.
 * Grows with later steps (clients, packages, workouts…).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { fail, withSystemDb } from "../cli/cli-db";
import { hashPassword } from "../common/security/passwords";
import { createTrainerAccount } from "../modules/auth/trainer-accounts";
import { users } from "./schema";

const DEMO_EMAIL = "demo.trainer@fitcoach.local";

async function main(): Promise<void> {
  if ((process.env.APP_ENV ?? "development") !== "development") {
    fail("db:seed only runs with APP_ENV=development.");
  }
  const password = process.env.SEED_TRAINER_PASSWORD ?? `demo-${randomBytes(6).toString("hex")}`;

  const outcome = await withSystemDb(async (tx, env) => {
    if (env.appEnv !== "development") fail("db:seed only runs with APP_ENV=development.");
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_EMAIL));
    if (existing) return "exists" as const;

    await createTrainerAccount(
      tx,
      {
        account: { email: DEMO_EMAIL, password },
        profile: { displayName: "Demo Trainer" },
        business: {
          businessName: "Demo Coaching",
          slug: "demo-coaching",
          city: "Local",
          coachingModes: ["in_person", "online"],
          timezone: "Asia/Kolkata",
        },
        acceptTerms: true,
      },
      {
        passwordHash: await hashPassword(password),
        clientLimit: 50,
        workspaceStatus: "active",
        emailVerified: true,
      },
    );
    return "created" as const;
  });

  if (outcome === "exists") {
    console.log(
      `[db:seed] ${DEMO_EMAIL} already exists — nothing to do. Use "Forgot password" in Mailpit if needed.`,
    );
  } else {
    console.log(`[db:seed] demo trainer: ${DEMO_EMAIL} / ${password}`);
  }
}

main().catch((error: unknown) =>
  fail(`[db:seed] failed: ${error instanceof Error ? error.message : String(error)}`),
);
