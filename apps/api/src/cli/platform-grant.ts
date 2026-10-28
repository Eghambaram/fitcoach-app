/**
 * `pnpm platform:grant <email>` — makes an existing account a platform owner (PROMPT §12.2). Audited.
 * The owner then signs in at /platform/login and sets up an authenticator app (mandatory TOTP).
 */
import { grantPlatformOwner } from "../modules/platform/platform-roles";
import { fail, withSystemDb } from "./cli-db";

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || !email.includes("@")) fail("Usage: pnpm platform:grant <email>");

  const operator = process.env.USERNAME ?? process.env.USER ?? "unknown";
  const result = await withSystemDb((tx) => grantPlatformOwner(tx, email, `cli:${operator}`));

  if (result.status === "no_account") {
    fail("No account uses that email. Sign up first, then run this again.");
  }
  console.log(
    result.status === "granted"
      ? "Granted platform_owner. Sign in at /platform/login and set up your authenticator app."
      : "That account is already a platform owner.",
  );
}

main().catch((error: unknown) =>
  fail(`[platform:grant] failed: ${error instanceof Error ? error.message : String(error)}`),
);
