import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { APP_ROLE, SYSTEM_ROLE } from "../db/bootstrap-roles";
import { runMigrations } from "../db/run-migrations";

export interface TestDatabaseUrls {
  ownerUrl: string;
  appUrl: string;
  systemUrl: string;
  appPassword: string;
  systemPassword: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    db: TestDatabaseUrls;
  }
}

/** Same major version as local Docker and Railway (ADR-0027). */
const POSTGRES_IMAGE = "postgres:17";
/** Vitest always runs from apps/api (the package root). */
export const MIGRATIONS_FOLDER = resolve(process.cwd(), "src/db/migrations");

function withCredentials(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

/** One throwaway Postgres per test project, migrated from zero with the real migration runner. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("fitcoach_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const ownerUrl = container.getConnectionUri();
  const appPassword = "app-test-password";
  const systemPassword = "system-test-password";
  await runMigrations({
    ownerUrl,
    appPassword,
    systemPassword,
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  project.provide("db", {
    ownerUrl,
    appUrl: withCredentials(ownerUrl, APP_ROLE, appPassword),
    systemUrl: withCredentials(ownerUrl, SYSTEM_ROLE, systemPassword),
    appPassword,
    systemPassword,
  });

  return async () => {
    await container.stop();
  };
}
