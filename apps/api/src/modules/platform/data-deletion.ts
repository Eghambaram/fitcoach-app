import { sql } from "drizzle-orm";
import type { Tx } from "../../db/database";
import { recordAudit } from "../audit/audit.service";

/**
 * Manual data deletion (PROMPT §12.4 MVP, docs/runbooks/data-deletion.md, ADR-0063). Run by the
 * platform owner through `pnpm data:delete`, as the database owner role: deletion is the one
 * thing the append-only rules (measurements, consents, payments, ledger) must give way to.
 *
 * What goes: the client (or lead) row and everything that cascades from it — goals, consents,
 * notes, measurements, check-ins, packages, payments, ledger, appointments, workouts, invites,
 * shares — the lead(s) the client came from, their app login if nothing else uses it, and in-app
 * notifications that point at any of those rows. What stays: audit entries (ids only, immutable)
 * and product events, which lose their user id. Backups age out within 35 days.
 */

export interface DeletionReport {
  kind: "client" | "lead";
  id: string;
  workspaceId: string;
  counts: Record<string, number>;
  loginDeleted: boolean;
}

type Row = Record<string, unknown>;

async function one(tx: Tx, query: ReturnType<typeof sql>): Promise<Row | undefined> {
  return (await tx.execute<Row>(query)).rows[0];
}

async function ids(tx: Tx, query: ReturnType<typeof sql>): Promise<string[]> {
  return (await tx.execute<{ id: string }>(query)).rows.map((row) => row.id);
}

/** Notifications whose data points at any of these rows (e.g. a check-in from the client). */
async function deleteNotifications(tx: Tx, workspaceId: string, related: string[]) {
  if (related.length === 0) return 0;
  const result = await tx.execute(sql`
    delete from notifications n
    where n.workspace_id = ${workspaceId}
      and exists (
        select 1 from jsonb_each_text(n.data) e
        where e.value in (${sql.join(
          related.map((id) => sql`${id}`),
          sql`, `,
        )})
      )`);
  return result.rowCount ?? 0;
}

async function leadRelated(tx: Tx, workspaceId: string, leadIds: string[]): Promise<string[]> {
  if (leadIds.length === 0) return [];
  const list = sql.join(
    leadIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return ids(
    tx,
    sql`select id::text as id from lead_follow_ups where workspace_id = ${workspaceId} and lead_id in (${list})
        union all select id::text from appointments where workspace_id = ${workspaceId} and lead_id in (${list})`,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteClientData(
  tx: Tx,
  input: { workspaceId: string; clientId: string; reason: string; operator: string },
): Promise<DeletionReport> {
  if (!UUID.test(input.workspaceId) || !UUID.test(input.clientId))
    throw new Error("ids must be UUIDs");
  const ws = input.workspaceId;
  const client = await one(
    tx,
    sql`select id, user_id, source_lead_id from clients
        where workspace_id = ${ws} and id = ${input.clientId} for update`,
  );
  if (!client) throw new Error("No client with that id in that workspace.");

  const leadIds = await ids(
    tx,
    sql`select id::text as id from leads where workspace_id = ${ws}
        and (id = ${client.source_lead_id as string | null} or converted_client_id = ${input.clientId})`,
  );
  const related = [
    input.clientId,
    ...leadIds,
    ...(await leadRelated(tx, ws, leadIds)),
    ...(await ids(
      tx,
      sql`select id::text as id from check_ins where workspace_id = ${ws} and client_id = ${input.clientId}
          union all select id::text from appointments where workspace_id = ${ws} and client_id = ${input.clientId}
          union all select id::text from client_packages where workspace_id = ${ws} and client_id = ${input.clientId}
          union all select id::text from workout_sessions where workspace_id = ${ws} and client_id = ${input.clientId}`,
    )),
  ];

  const countRow = await one(
    tx,
    sql`select
      (select count(*) from appointments where workspace_id = ${ws} and client_id = ${input.clientId})::int as appointments,
      (select count(*) from workout_sessions where workspace_id = ${ws} and client_id = ${input.clientId})::int as workouts,
      (select count(*) from measurements where workspace_id = ${ws} and client_id = ${input.clientId})::int as measurements,
      (select count(*) from check_ins where workspace_id = ${ws} and client_id = ${input.clientId})::int as check_ins,
      (select count(*) from client_packages where workspace_id = ${ws} and client_id = ${input.clientId})::int as packages,
      (select count(*) from client_payments p join client_packages k on k.workspace_id = p.workspace_id
         and k.id = p.package_id where k.workspace_id = ${ws} and k.client_id = ${input.clientId})::int as payments,
      (select count(*) from client_notes where workspace_id = ${ws} and client_id = ${input.clientId})::int as notes`,
  );

  // The client's app login goes too, unless it also belongs to a client elsewhere (ADR-0055).
  const userId = client.user_id as string | null;
  const shared = userId
    ? await one(
        tx,
        sql`select 1 from clients where user_id = ${userId} and id <> ${input.clientId} limit 1`,
      )
    : undefined;
  const isClientLogin = userId
    ? await one(tx, sql`select 1 from profiles where user_id = ${userId} and kind = 'client'`)
    : undefined;

  const notifications = await deleteNotifications(tx, ws, related);
  // A converted client and its lead point at each other: delete both in one statement, so the
  // foreign keys are checked once both rows are gone.
  const leadList =
    leadIds.length > 0
      ? sql.join(
          leadIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )
      : sql`null::uuid`;
  await tx.execute(sql`
    with deleted_client as (
      delete from clients where workspace_id = ${ws} and id = ${input.clientId} returning id
    )
    delete from leads where workspace_id = ${ws} and id in (${leadList})`);
  let loginDeleted = false;
  if (userId && !shared && isClientLogin) {
    await tx.execute(sql`update product_events set user_id = null where user_id = ${userId}`);
    await tx.execute(sql`delete from users where id = ${userId}`);
    loginDeleted = true;
  }

  const counts = {
    ...Object.fromEntries(
      Object.entries(countRow ?? {}).map(([key, value]) => [key, Number(value)]),
    ),
    leads: leadIds.length,
    notifications,
  };
  await recordAudit(tx, {
    actorKind: "cli",
    actorUserId: null,
    workspaceId: ws,
    action: "client.data_deleted",
    targetType: "client",
    targetId: input.clientId,
    reason: input.reason,
    after: { counts, loginDeleted, operator: input.operator },
  });
  return { kind: "client", id: input.clientId, workspaceId: ws, counts, loginDeleted };
}

/** A lead that never became a client (a converted lead goes with its client). */
export async function deleteLeadData(
  tx: Tx,
  input: { workspaceId: string; leadId: string; reason: string; operator: string },
): Promise<DeletionReport> {
  if (!UUID.test(input.workspaceId) || !UUID.test(input.leadId))
    throw new Error("ids must be UUIDs");
  const ws = input.workspaceId;
  const lead = await one(
    tx,
    sql`select id, converted_client_id from leads where workspace_id = ${ws} and id = ${input.leadId} for update`,
  );
  if (!lead) throw new Error("No lead with that id in that workspace.");
  const client = await one(
    tx,
    sql`select id from clients where workspace_id = ${ws}
        and (source_lead_id = ${input.leadId} or id = ${lead.converted_client_id as string | null})`,
  );
  if (client) {
    throw new Error(
      `This lead became client ${String(client.id)}. Delete the client instead: it removes the lead too.`,
    );
  }
  const related = [input.leadId, ...(await leadRelated(tx, ws, [input.leadId]))];
  const countRow = await one(
    tx,
    sql`select
      (select count(*) from lead_follow_ups where workspace_id = ${ws} and lead_id = ${input.leadId})::int as follow_ups,
      (select count(*) from lead_activities where workspace_id = ${ws} and lead_id = ${input.leadId})::int as activities,
      (select count(*) from appointments where workspace_id = ${ws} and lead_id = ${input.leadId})::int as appointments`,
  );
  const notifications = await deleteNotifications(tx, ws, related);
  await tx.execute(sql`delete from leads where workspace_id = ${ws} and id = ${input.leadId}`);
  const counts = {
    ...Object.fromEntries(
      Object.entries(countRow ?? {}).map(([key, value]) => [key, Number(value)]),
    ),
    notifications,
  };
  await recordAudit(tx, {
    actorKind: "cli",
    actorUserId: null,
    workspaceId: ws,
    action: "lead.data_deleted",
    targetType: "lead",
    targetId: input.leadId,
    reason: input.reason,
    after: { counts, operator: input.operator },
  });
  return { kind: "lead", id: input.leadId, workspaceId: ws, counts, loginDeleted: false };
}
