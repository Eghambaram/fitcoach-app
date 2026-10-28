import { EXPORT_FILES } from "@fitcoach/shared";
import archiver from "archiver";
import { sql } from "drizzle-orm";
import type { Tx } from "../../db/database";
import { csvCell, csvDocument } from "../../common/csv";

type ExportFile = (typeof EXPORT_FILES)[number];
type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/** Integer paise → "1234.50" (CLAUDE.md rule 20a: no floats, even on the way out). */
export function rupees(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const paise = BigInt(String(value));
  const sign = paise < 0n ? "-" : "";
  const abs = paise < 0n ? -paise : paise;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function formatter(timezone: string) {
  const when = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (value: unknown): string | null =>
    value === null || value === undefined
      ? null
      : when.format(value instanceof Date ? value : new Date(String(value))).replace(",", "");
}

/** Free text (names, notes) is formula-neutralised; enums, dates and numbers are not. */
const free = (value: unknown) => csvCell(text(value));
const fixed = (value: unknown) => csvCell(text(value), { freeText: false });

const rows = async (tx: Tx, query: ReturnType<typeof sql>): Promise<Row[]> =>
  (await tx.execute<Row>(query)).rows;

/**
 * Builds the workspace's CSVs (PROMPT §8.12). Runs as fitcoach_system inside the export job, so
 * every query filters by the workspace explicitly. Voided payments and measurements are included
 * and marked, because history is append-only (rule 16). Times are in the workspace timezone.
 */
export async function buildExportCsvs(
  tx: Tx,
  workspaceId: string,
  timezone: string,
): Promise<Record<ExportFile, string>> {
  const at = formatter(timezone);

  const leads = await rows(
    tx,
    sql`select full_name, phone_e164, email, goal, training_mode, source, stage, lost_reason,
          location, interested_service, referrer, campaign, created_at, last_contact_at,
          next_follow_up_at, converted_at
        from leads where workspace_id = ${workspaceId} order by created_at, id`,
  );
  const clients = await rows(
    tx,
    sql`select full_name, phone_e164, email, status, goal, training_mode, source, coaching_start_on,
          dob, experience_level, onboarded_at, archived_at
        from clients where workspace_id = ${workspaceId} order by full_name, id`,
  );
  const appointments = await rows(
    tx,
    sql`select a.starts_at, a.duration_min, a.kind, a.status, coalesce(c.full_name, l.full_name) as person,
          a.location, a.late_cancel, a.cancel_reason, a.attendance_marked_at
        from appointments a
        left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
        left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
        where a.workspace_id = ${workspaceId} order by a.starts_at, a.id`,
  );
  const packages = await rows(
    tx,
    sql`select c.full_name, p.name, p.kind, p.status, p.sessions_included, p.starts_on, p.expires_on,
          p.price_paise, p.amount_due_paise, p.payment_due_on,
          (select coalesce(sum(sessions_used), 0) from package_session_ledger x
            where x.workspace_id = p.workspace_id and x.package_id = p.id) as sessions_used
        from client_packages p
        join clients c on c.workspace_id = p.workspace_id and c.id = p.client_id
        where p.workspace_id = ${workspaceId} order by p.starts_on, p.id`,
  );
  const payments = await rows(
    tx,
    sql`select pay.paid_on, c.full_name, p.name as package_name, pay.amount_paise, pay.method,
          pay.reference, pay.note, pay.voids_id is not null as is_void, pay.void_reason
        from client_payments pay
        join client_packages p on p.workspace_id = pay.workspace_id and p.id = pay.package_id
        join clients c on c.workspace_id = p.workspace_id and c.id = p.client_id
        where pay.workspace_id = ${workspaceId} order by pay.paid_on, pay.created_at, pay.id`,
  );
  const measurements = await rows(
    tx,
    sql`select m.measured_on, c.full_name, t.name as type_name, t.unit_kind, m.value, m.source,
          m.note, m.voided_at, m.void_reason
        from measurements m
        join clients c on c.workspace_id = m.workspace_id and c.id = m.client_id
        join measurement_types t on t.id = m.type_id
        where m.workspace_id = ${workspaceId} order by m.measured_on, m.created_at, m.id`,
  );

  const units: Record<string, string> = { mass: "kg", length: "cm", percent: "%", count: "" };

  return {
    leads: csvDocument(
      [
        "Name",
        "Phone",
        "Email",
        "Goal",
        "Training mode",
        "Source",
        "Stage",
        "Lost reason",
        "Location",
        "Interested in",
        "Referrer",
        "Campaign",
        "Created",
        "Last contact",
        "Next follow-up",
        "Converted",
      ],
      leads.map((row) => [
        free(row.full_name),
        fixed(row.phone_e164),
        free(row.email),
        fixed(row.goal),
        fixed(row.training_mode),
        fixed(row.source),
        fixed(row.stage),
        fixed(row.lost_reason),
        free(row.location),
        free(row.interested_service),
        free(row.referrer),
        free(row.campaign),
        fixed(at(row.created_at)),
        fixed(at(row.last_contact_at)),
        fixed(at(row.next_follow_up_at)),
        fixed(at(row.converted_at)),
      ]),
    ),
    clients: csvDocument(
      [
        "Name",
        "Phone",
        "Email",
        "Status",
        "Goal",
        "Training mode",
        "Source",
        "Coaching start",
        "Date of birth",
        "Experience",
        "Onboarded",
        "Archived",
      ],
      clients.map((row) => [
        free(row.full_name),
        fixed(row.phone_e164),
        free(row.email),
        fixed(row.status),
        fixed(row.goal),
        fixed(row.training_mode),
        fixed(row.source),
        fixed(row.coaching_start_on),
        fixed(row.dob),
        fixed(row.experience_level),
        fixed(at(row.onboarded_at)),
        fixed(at(row.archived_at)),
      ]),
    ),
    appointments: csvDocument(
      [
        "Starts",
        "Minutes",
        "Kind",
        "Status",
        "With",
        "Location",
        "Late cancel",
        "Cancel reason",
        "Attendance marked",
      ],
      appointments.map((row) => [
        fixed(at(row.starts_at)),
        fixed(row.duration_min),
        fixed(row.kind),
        fixed(row.status),
        free(row.person),
        free(row.location),
        fixed(row.late_cancel === true ? "yes" : "no"),
        free(row.cancel_reason),
        fixed(at(row.attendance_marked_at)),
      ]),
    ),
    packages: csvDocument(
      [
        "Client",
        "Package",
        "Kind",
        "Status",
        "Sessions included",
        "Sessions used",
        "Starts",
        "Expires",
        "Price (INR)",
        "Amount due (INR)",
        "Payment due",
      ],
      packages.map((row) => [
        free(row.full_name),
        free(row.name),
        fixed(row.kind),
        fixed(row.status),
        fixed(row.sessions_included),
        fixed(row.sessions_used),
        fixed(row.starts_on),
        fixed(row.expires_on),
        fixed(rupees(row.price_paise)),
        fixed(rupees(row.amount_due_paise)),
        fixed(row.payment_due_on),
      ]),
    ),
    payments: csvDocument(
      [
        "Paid on",
        "Client",
        "Package",
        "Amount (INR)",
        "Method",
        "Reference",
        "Note",
        "Void entry",
        "Void reason",
      ],
      payments.map((row) => [
        fixed(row.paid_on),
        free(row.full_name),
        free(row.package_name),
        fixed(rupees(row.amount_paise)),
        fixed(row.method),
        free(row.reference),
        free(row.note),
        fixed(row.is_void === true ? "yes" : "no"),
        free(row.void_reason),
      ]),
    ),
    measurements: csvDocument(
      [
        "Measured on",
        "Client",
        "Measurement",
        "Value",
        "Unit",
        "Source",
        "Note",
        "Voided",
        "Void reason",
      ],
      measurements.map((row) => [
        fixed(row.measured_on),
        free(row.full_name),
        free(row.type_name),
        fixed(row.value),
        fixed(units[String(row.unit_kind)] ?? ""),
        fixed(row.source),
        free(row.note),
        fixed(at(row.voided_at)),
        free(row.void_reason),
      ]),
    ),
  };
}

/** One zip of `<name>.csv` files, in memory (beta workspaces are small). */
export function zipCsvs(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", reject);
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const [name, content] of Object.entries(files)) {
      archive.append(Buffer.from(content, "utf8"), { name: `${name}.csv` });
    }
    void archive.finalize();
  });
}
