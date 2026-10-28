import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

describe("platform owner MFA tables (step 6.1)", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let trainer: Trainer;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    trainer = await createTrainer(drizzleFor(system));
    await system.query(
      "insert into platform_mfa (user_id, secret_ciphertext) values ($1, 'v1:a:b:c')",
      [trainer.userId],
    );
    await system.query(
      "insert into platform_recovery_codes (user_id, code_hash) values ($1, 'hash-1')",
      [trainer.userId],
    );
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  it("keeps TOTP secrets and recovery codes away from the request role, whoever is signed in", async () => {
    for (const context of [
      trainerContext(trainer),
      { userId: trainer.userId, actor: "platform_owner" as const },
      {},
    ]) {
      await withContext(app, context, async (client) => {
        for (const table of ["platform_mfa", "platform_recovery_codes"]) {
          expect(await sqlStateIn(client, `select 1 from ${table}`)).toBe("42501");
          expect(await sqlStateIn(client, `delete from ${table}`)).toBe("42501");
        }
        expect(
          await sqlStateIn(
            client,
            "insert into platform_mfa (user_id, secret_ciphertext) values ($1, 'x')",
            [trainer.userId],
          ),
        ).toBe("42501");
      });
    }
  });

  it("lets the platform auth flow (system) read and update them, never truncate", async () => {
    const read = await system.query(
      "select secret_ciphertext from platform_mfa where user_id = $1",
      [trainer.userId],
    );
    expect(read.rows).toEqual([{ secret_ciphertext: "v1:a:b:c" }]);
    expect(
      (
        await system.query(
          "update platform_recovery_codes set used_at = now() where user_id = $1",
          [trainer.userId],
        )
      ).rowCount,
    ).toBe(1);
    expect(await sqlState(system.query("truncate platform_mfa"))).toBe("42501");
    // A recovery code hash is unique.
    expect(
      await sqlState(
        system.query(
          "insert into platform_recovery_codes (user_id, code_hash) values ($1, 'hash-1')",
          [trainer.userId],
        ),
      ),
    ).toBe("23505");
  });

  it("lets the system record the new platform notification types", async () => {
    await system.query(
      `insert into notifications (workspace_id, recipient_user_id, type, title, dedupe_key)
       values ($1, $2, 'workspace_suspended', 'Suspended', 'ws:1')`,
      [trainer.workspaceId, trainer.userId],
    );
    await withContext(app, trainerContext(trainer), async (client) => {
      // A trainer can't fake one.
      expect(
        await sqlStateIn(
          client,
          `insert into notifications (workspace_id, recipient_user_id, type, title, dedupe_key)
           values ($1, $2, 'account_approved', 'Approved', 'ws:2')`,
          [trainer.workspaceId, trainer.userId],
        ),
      ).toBe("42501");
    });
  });
});
