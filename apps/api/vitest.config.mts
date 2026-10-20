import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC emits decorator metadata, which Nest's dependency injection needs (esbuild does not).
// Projects: `unit` (no I/O) · `db` (RLS/constraints as real roles) · `api` (Nest app over HTTP).
// `db` and `api` start a throwaway Postgres with Testcontainers (Docker must be running).
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts", "src/**/*.api.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["src/test/postgres.global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["src/**/*.api.test.ts"],
          globalSetup: ["src/test/postgres.global-setup.ts", "src/test/storage.global-setup.ts"],
          setupFiles: ["src/test/api-env.setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
