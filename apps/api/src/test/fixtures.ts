import { randomUUID } from "node:crypto";
import type { SignupRequest } from "@fitcoach/shared";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { Database, Tx } from "../db/database";
import * as schema from "../db/schema";
import { createTrainerAccount, type NewTrainerAccount } from "../modules/auth/trainer-accounts";

/** Must match SESSION_SECRET in api-env.setup.ts so codes created here validate in the API. */
export const TEST_SESSION_SECRET = "test-session-secret-0123456789abcdef";

export function drizzleFor(pool: Pool): Database {
  return drizzle({ client: pool, schema });
}

/** Runs `fn` as fitcoach_system (like SystemDb.run) and commits. */
export function asSystem<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor', 'system', true)`);
    return fn(tx);
  });
}

let counter = 0;

/** A valid, unique signup payload (unique email and slug per call). */
export function signupInput(overrides: Partial<SignupRequest["business"]> = {}): SignupRequest {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${randomUUID().slice(0, 4)}`;
  return {
    account: { email: `trainer-${id}@example.test`, password: "a-long-unique-passphrase" },
    profile: { displayName: "Test Trainer", phone: "98765 43210" },
    business: {
      businessName: "Test Coaching",
      slug: `coach-${id}`,
      city: "Pune",
      coachingModes: ["in_person"],
      timezone: "Asia/Kolkata",
      ...overrides,
    },
    inviteCode: undefined,
    acceptTerms: true,
  };
}

/** Creates a verified trainer directly (no HTTP), for DB-level tests. */
export function createTrainer(db: Database): Promise<NewTrainerAccount & { email: string }> {
  const input = signupInput();
  return asSystem(db, async (tx) => ({
    ...(await createTrainerAccount(tx, input, {
      passwordHash: "not-a-real-hash",
      clientLimit: 50,
      workspaceStatus: "active",
      emailVerified: true,
    })),
    email: input.account.email,
  }));
}

/** The RLS context a trainer's request runs with. */
export function trainerContext(account: NewTrainerAccount) {
  return { userId: account.userId, workspaceId: account.workspaceId, actor: "trainer" as const };
}
