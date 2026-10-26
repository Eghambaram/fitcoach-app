import { Injectable } from "@nestjs/common";
import type { AppointmentStatus, LedgerReason } from "@fitcoach/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  appointments,
  clientPackages,
  packageSessionLedger,
  trainerSettings,
  workspaces,
} from "../../db/schema";

/** What changed about a client appointment that may use (or give back) a package session. */
export interface SessionUseChange {
  appointmentId: string;
  clientId: string;
  from: AppointmentStatus;
  to: AppointmentStatus;
  /** Cancelled inside the late-cancel window (D25). */
  lateCancel: boolean;
}

/**
 * Package session deduction (PROMPT §8.3A, CLAUDE.md rule 20b). Called by the scheduling service
 * inside the same transaction as attendance marking, un-marking and late cancellation, with the
 * appointment row already locked — so a double submit is serialized and finds its own mark.
 *
 * - attended → +1; no-show / late cancel → +1 or 0 per the workspace's D25 policy;
 * - time-based and online packages record 0 (history only, ADR-0031);
 * - no usable package, or no sessions left → no row: attendance saves "without a package";
 * - un-marking (or switching attended ↔ no-show) writes a reversal row, never an update or delete.
 */
@Injectable()
export class SessionDeductionService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async applySessionUse(change: SessionUseChange): Promise<void> {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    const workspaceId = auth.workspaceId;
    const [policy] = await this.db.tx
      .select({
        noShow: trainerSettings.noShowUsesSession,
        lateCancel: trainerSettings.lateCancelUsesSession,
      })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, workspaceId));

    const target = this.reasonFor(change.to, change.lateCancel);
    const open = await this.openMark(workspaceId, change.appointmentId);
    if (open && open.reason === target) return; // already recorded: idempotent
    if (open) {
      await this.db.tx.insert(packageSessionLedger).values({
        workspaceId,
        packageId: open.packageId,
        appointmentId: change.appointmentId,
        reason: open.reason,
        sessionsUsed: -open.sessionsUsed,
        reversesId: open.id,
        actorUserId: auth.userId,
      });
    }
    if (!target) return;

    const pkg = await this.usablePackage(workspaceId, change.clientId, change.appointmentId);
    if (!pkg) return;
    let sessionsUsed = 0;
    if (pkg.kind === "session_pack" && pkg.sessionsIncluded !== null) {
      const wantsSession =
        target === "attended" ||
        (target === "no_show" && (policy?.noShow ?? true)) ||
        (target === "late_cancel" && (policy?.lateCancel ?? true));
      if (wantsSession) {
        if (pkg.used >= pkg.sessionsIncluded) return; // none left: recorded without a package
        sessionsUsed = 1;
      }
    }
    const [marks] = await this.db.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(packageSessionLedger)
      .where(
        and(
          eq(packageSessionLedger.workspaceId, workspaceId),
          eq(packageSessionLedger.packageId, pkg.id),
          eq(packageSessionLedger.appointmentId, change.appointmentId),
          isNull(packageSessionLedger.reversesId),
        ),
      );
    await this.db.tx.insert(packageSessionLedger).values({
      workspaceId,
      packageId: pkg.id,
      appointmentId: change.appointmentId,
      reason: target,
      sessionsUsed,
      markNo: (marks?.count ?? 0) + 1,
      actorUserId: auth.userId,
    });
  }

  private reasonFor(status: AppointmentStatus, lateCancel: boolean): LedgerReason | null {
    if (status === "completed") return "attended";
    if (status === "no_show") return "no_show";
    if (status === "cancelled" && lateCancel) return "late_cancel";
    return null;
  }

  /**
   * The appointment's latest mark that hasn't been reversed, on any package. The outer row is named
   * by hand: in a single-table select Drizzle renders `${packageSessionLedger.id}` unqualified.
   */
  private async openMark(workspaceId: string, appointmentId: string) {
    const outer = sql.identifier("package_session_ledger");
    const [mark] = await this.db.tx
      .select({
        id: packageSessionLedger.id,
        packageId: packageSessionLedger.packageId,
        reason: packageSessionLedger.reason,
        sessionsUsed: packageSessionLedger.sessionsUsed,
      })
      .from(packageSessionLedger)
      .where(
        and(
          eq(packageSessionLedger.workspaceId, workspaceId),
          eq(packageSessionLedger.appointmentId, appointmentId),
          isNull(packageSessionLedger.reversesId),
          sql`not exists (
            select 1 from ${packageSessionLedger} r where r.reverses_id = ${outer}.id
          )`,
        ),
      )
      .orderBy(desc(packageSessionLedger.createdAt), desc(packageSessionLedger.markNo))
      .limit(1);
    return mark ? { ...mark, reason: mark.reason as LedgerReason } : null;
  }

  /**
   * The client's active package, locked so two sessions can't both take the last one, if it hadn't
   * expired on the session's day (workspace time zone).
   */
  private async usablePackage(workspaceId: string, clientId: string, appointmentId: string) {
    const [pkg] = await this.db.tx
      .select({
        id: clientPackages.id,
        kind: clientPackages.kind,
        sessionsIncluded: clientPackages.sessionsIncluded,
        expiresOn: clientPackages.expiresOn,
      })
      .from(clientPackages)
      .where(
        and(
          eq(clientPackages.workspaceId, workspaceId),
          eq(clientPackages.clientId, clientId),
          eq(clientPackages.status, "active"),
        ),
      )
      .for("update");
    if (!pkg) return null;
    if (pkg.expiresOn !== null) {
      const [session] = await this.db.tx
        .select({
          day: sql<string>`to_char(${appointments.startsAt} at time zone ${workspaces.timezone}, 'YYYY-MM-DD')`,
        })
        .from(appointments)
        .innerJoin(workspaces, eq(workspaces.id, appointments.workspaceId))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.workspaceId, workspaceId)));
      if (session && session.day > pkg.expiresOn) return null;
    }
    const [used] = await this.db.tx
      .select({ total: sql<number>`coalesce(sum(${packageSessionLedger.sessionsUsed}), 0)::int` })
      .from(packageSessionLedger)
      .where(
        and(
          eq(packageSessionLedger.workspaceId, workspaceId),
          eq(packageSessionLedger.packageId, pkg.id),
        ),
      );
    return { ...pkg, used: Number(used?.total ?? 0) };
  }
}
