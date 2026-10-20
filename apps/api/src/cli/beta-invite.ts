/**
 * `pnpm beta:invite` — manage closed-beta signup codes (ADR-0029). Audited.
 *   pnpm beta:invite create [--uses 5] [--days 30] [--label "Pune trainers"] [--json]
 *   pnpm beta:invite list
 *   pnpm beta:invite revoke <id>
 */
import { parseArgs } from "node:util";
import {
  createBetaInvite,
  listBetaInvites,
  revokeBetaInvite,
} from "../modules/platform/beta-invites";
import { fail, withSystemDb } from "./cli-db";

const USAGE = `Usage:
  pnpm beta:invite create [--uses <n>] [--days <n>] [--label <text>] [--json]
  pnpm beta:invite list
  pnpm beta:invite revoke <id>`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      uses: { type: "string", default: "1" },
      days: { type: "string", default: "30" },
      label: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const [command, id] = positionals;

  if (command === "create") {
    const maxUses = Number(values.uses);
    const days = Number(values.days);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
      fail("--uses must be a whole number from 1 to 1000");
    if (!Number.isInteger(days) || days < 1 || days > 365)
      fail("--days must be a whole number from 1 to 365");

    const invite = await withSystemDb((tx, env) =>
      createBetaInvite(tx, env.sessionSecret, {
        maxUses,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        label: values.label,
        createdBy: "cli",
      }),
    );
    if (values.json) {
      console.log(
        JSON.stringify({ id: invite.id, code: invite.code, maxUses, expiresAt: invite.expiresAt }),
      );
    } else {
      console.log(`Beta invite code: ${invite.code}`);
      console.log(
        `  uses: ${maxUses} · expires: ${invite.expiresAt.toISOString().slice(0, 10)} · id: ${invite.id}`,
      );
      console.log(
        "Share the code with the trainer. It is shown only once — only its hash is stored.",
      );
    }
    return;
  }

  if (command === "list") {
    const invites = await withSystemDb((tx) => listBetaInvites(tx));
    if (invites.length === 0) {
      console.log("No beta invites yet. Create one with: pnpm beta:invite create");
      return;
    }
    for (const invite of invites) {
      const state = invite.revokedAt
        ? "revoked"
        : invite.expiresAt < new Date()
          ? "expired"
          : "active";
      console.log(
        `${invite.id}  ${state.padEnd(7)}  ${invite.uses}/${invite.maxUses} used  expires ${invite.expiresAt.toISOString().slice(0, 10)}  ${invite.label ?? ""}`,
      );
    }
    return;
  }

  if (command === "revoke" && id) {
    const revoked = await withSystemDb((tx) => revokeBetaInvite(tx, id, "cli"));
    console.log(revoked ? `Revoked ${id}.` : `No active invite with id ${id}.`);
    return;
  }

  fail(USAGE);
}

main().catch((error: unknown) =>
  fail(`[beta:invite] failed: ${error instanceof Error ? error.message : String(error)}`),
);
