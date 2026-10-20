import { execFileSync } from "node:child_process";

/**
 * Creates a beta invite code for the e2e run with the real CLI (`pnpm beta:invite`), exactly as an
 * operator would. The code is handed to specs through an env var.
 */
export default function globalSetup(): void {
  const output = execFileSync(
    "pnpm",
    [
      "--silent",
      "--filter",
      "@fitcoach/api",
      "beta:invite",
      "create",
      "--uses",
      "50",
      "--days",
      "1",
      "--label",
      "e2e",
      "--json",
    ],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  const line = output.trim().split(/\r?\n/).at(-1) ?? "";
  const { code } = JSON.parse(line) as { code: string };
  process.env.E2E_INVITE_CODE = code;
}
