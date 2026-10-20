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
  // Self-contained server for the Docker image (apps/web/Dockerfile, PROMPT §17.2). Tracing from the
  // repo root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
};

export default nextConfig;
