import { defineConfig } from "drizzle-kit";

// `pnpm db:generate --name <name>` diffs the schema into a new SQL migration (no DB connection needed).
// Then hand-edit: RLS, grants and functions go in a `--custom` migration (CLAUDE.md "Database workflow").
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  strict: true,
  verbose: true,
});
