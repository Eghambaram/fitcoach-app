/**
 * `pnpm data:delete` — delete one client's or lead's personal data on request (PROMPT §12.4,
 * docs/runbooks/data-deletion.md). Audited. A dry run unless `--confirm` is given.
 *   pnpm data:delete client <workspaceId> <clientId> --reason "<request reference>" [--confirm]
 *   pnpm data:delete lead <workspaceId> <leadId> --reason "<request reference>" [--confirm]
 */
import { parseArgs } from "node:util";
import {
  type DeletionReport,
  deleteClientData,
  deleteLeadData,
} from "../modules/platform/data-deletion";
import { fail, withOwnerDb } from "./cli-db";

const USAGE = `Usage:
  pnpm data:delete client <workspaceId> <clientId> --reason "<request reference>" [--confirm]
  pnpm data:delete lead <workspaceId> <leadId> --reason "<request reference>" [--confirm]
Without --confirm nothing is deleted: you see what would be.`;

class DryRun extends Error {
  constructor(readonly report: DeletionReport) {
    super("dry run");
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      reason: { type: "string" },
      confirm: { type: "boolean", default: false },
    },
  });
  const [kind, workspaceId, id] = positionals;
  if ((kind !== "client" && kind !== "lead") || !workspaceId || !id) fail(USAGE);
  const reason = values.reason?.trim() ?? "";
  if (reason.length < 3 || reason.length > 500) {
    fail(
      "--reason is required (3–500 characters): the request it fulfils, e.g. a ticket or email date.",
    );
  }
  const operator = `cli:${process.env.USERNAME ?? process.env.USER ?? "unknown"}`;
  const input = { workspaceId, reason, operator };

  let report: DeletionReport;
  try {
    report = await withOwnerDb(async (tx) => {
      const result =
        kind === "client"
          ? await deleteClientData(tx, { ...input, clientId: id })
          : await deleteLeadData(tx, { ...input, leadId: id });
      // A dry run does the real work, reports it, and rolls everything back.
      if (!values.confirm) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    console.warn(`DRY RUN — nothing was deleted. With --confirm this ${kind} would go:`);
    console.warn(JSON.stringify(error.report, null, 2));
    return;
  }
  console.warn(`Deleted ${kind} ${report.id}. The audit log has an entry (${kind}.data_deleted).`);
  console.warn(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) =>
  fail(`[data:delete] failed: ${error instanceof Error ? error.message : String(error)}`),
);
