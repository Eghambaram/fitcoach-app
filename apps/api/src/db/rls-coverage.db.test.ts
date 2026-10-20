import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPool } from "../test/db";

/**
 * CI gate (PROMPT §10.5, CLAUDE.md rule 5): every table in `public` has RLS enabled AND forced.
 * Only global reference data readable by everyone may be listed here — each entry needs a reason.
 */
const RLS_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  // e.g. ["subscription_plans", "global reference data, readable by all"] — none yet.
]);

describe("RLS coverage", () => {
  let owner: Pool;

  beforeAll(() => {
    owner = createPool(inject("db").ownerUrl);
  });

  afterAll(async () => {
    await owner.end();
  });

  it("enables and forces row level security on every public table", async () => {
    const { rows } = await owner.query<{ table: string; enabled: boolean; forced: boolean }>(`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname
    `);

    expect(rows.length).toBeGreaterThan(0);
    const missing = rows
      .filter((row) => !RLS_ALLOW_LIST.has(row.table))
      .filter((row) => !row.enabled || !row.forced)
      .map((row) => row.table);
    expect(
      missing,
      `tables without ENABLE + FORCE ROW LEVEL SECURITY: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the allow-list honest (no stale entries)", async () => {
    const { rows } = await owner.query<{ table: string }>(`
      select tablename as table from pg_tables where schemaname = 'public'
    `);
    const existing = new Set(rows.map((row) => row.table));

    for (const table of RLS_ALLOW_LIST.keys()) {
      expect(existing.has(table), `${table} is allow-listed but doesn't exist`).toBe(true);
    }
  });
});
