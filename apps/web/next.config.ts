import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// The monorepo keeps one local .env at the repo root (docs/local-development.md). Next only reads
// env files from apps/web, so load the root one too. Variables already set win, and deployed
// environments have no file, so this only affects local development.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output for the Railway Docker image is configured in step 1.6.
};

export default nextConfig;
