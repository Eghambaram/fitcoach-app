/**
 * `pnpm platform:grant <email>` — makes an existing account a platform owner (PROMPT §12.2). Audited.
 * The platform login with mandatory TOTP MFA arrives in step 6.1.
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
      ? "Granted platform_owner. The platform login and MFA setup arrive in step 6.1."
      : "That account is already a platform owner.",
  );
}

main().catch((error: unknown) =>
  fail(`[platform:grant] failed: ${error instanceof Error ? error.message : String(error)}`),
);
