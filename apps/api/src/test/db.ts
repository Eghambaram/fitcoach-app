import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export interface RlsContext {
  userId?: string;
  workspaceId?: string;
  clientId?: string;
  actor?: "trainer" | "client" | "platform_owner" | "system";
}

/** A pool for one role in the test database. Close it in `afterAll`. */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 3 });
}

/** The same `set_config(…, true)` context the API's DbContext interceptor applies. */
async function applyContext(client: PoolClient, context: RlsContext): Promise<void> {
  await client.query(
    `select set_config('app.user_id', $1, true), set_config('app.workspace_id', $2, true),
            set_config('app.client_id', $3, true), set_config('app.actor', $4, true)`,
    [context.userId ?? "", context.workspaceId ?? "", context.clientId ?? "", context.actor ?? ""],
  );
}

async function inTransaction<T>(
  pool: Pool,
  context: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
  commit: boolean,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyContext(client, context);
    const result = await fn(client);
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Runs `fn` with an RLS context, then rolls back so tests don't leak rows into each other. */
export function withContext<T>(
  pool: Pool,
  context: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, context, fn, false);
}

/** Like `withContext` but commits, for rows another connection must see. */
export function committed<T>(
  pool: Pool,
  context: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, context, fn, true);
}

/** Two unrelated trainers in two workspaces — the standard cross-tenant fixture. */
export function twoTenants() {
  return {
    a: { userId: randomUUID(), workspaceId: randomUUID(), actor: "trainer" as const },
    b: { userId: randomUUID(), workspaceId: randomUUID(), actor: "trainer" as const },
  };
}

/** Postgres SQLSTATE of a rejected promise, for asserting *why* the database said no. */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

/**
 * SQLSTATE of one statement inside an open transaction, using a savepoint so a refused statement
 * doesn't abort the rest of the transaction (Postgres would answer 25P02 to everything after it).
 */
export async function sqlStateIn(
  client: PoolClient,
  query: string,
  params: unknown[] = [],
): Promise<string | undefined> {
  await client.query("savepoint attempt");
  try {
    await client.query(query, params);
    await client.query("release savepoint attempt");
    return undefined;
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return (error as { code?: string }).code;
  }
}
