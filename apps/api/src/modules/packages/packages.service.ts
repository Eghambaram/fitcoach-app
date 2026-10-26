import { Injectable } from "@nestjs/common";
import {
  type CancelPackageRequest,
  type ClientPackagesResponse,
  ERROR_CODES,
  formatInr,
  type InitialPackage,
  type LedgerEntry,
  type LedgerReason,
  type PackageCard,
  type PackageKind,
  type PackageSummary,
  type Payment,
  type PaymentMethod,
  type RecordPaymentRequest,
  type SellPackageRequest,
  type SessionAdjustmentRequest,
  type VoidPaymentRequest,
} from "@fitcoach/shared";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  activityEvents,
  appointments,
  clientPackages,
  clientPayments,
  clients,
  packagePresets,
  packageSessionLedger,
  trainerSettings,
  workspaces,
} from "../../db/schema";
import { trackEvent } from "../product-events/track";

type Trainer = AuthContext & { workspaceId: string };
type PackageRow = typeof clientPackages.$inferSelect;
type PackageWithTotals = { pkg: PackageRow; used: number; paid: number };
export type SaleSource = "profile" | "conversion" | "onboarding";

const packageNotFound = () => DomainError.notFound("That package doesn't exist.");
const clientNotFound = () => DomainError.notFound("That client doesn't exist.");
const invalid = (fieldErrors: Record<string, string[]>, message = "Some details need fixing.") =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, message, fieldErrors);
const refuse = (message: string) => new DomainError(ERROR_CODES.CONFLICT_STATE, 409, message);
const iso = (value: Date) => value.toISOString();

/** Dates as YYYY-MM-DD strings, stepped in UTC so no time zone can shift a day. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Packages, sessions and manually recorded payments (PROMPT §8.3A). Runs in the request transaction
 * as fitcoach_app; every query also filters by the workspace from the session (CLAUDE.md rules 1, 3).
 * Session use is written by `SessionDeductionService` in the attendance transaction (rule 20b).
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly idempotency: IdempotencyService,
  ) {}

  trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  /** Today in the workspace time zone (rule 19). */
  async today(trainer: Trainer): Promise<string> {
    const [row] = await this.db.tx
      .select({ timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.forbidden();
    return new Intl.DateTimeFormat("en-CA", { timeZone: row.timezone }).format(new Date());
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  /**
   * Packages with net sessions used and valid payments. The correlated subqueries name the outer
   * table by hand: in a single-table select Drizzle renders its columns unqualified.
   */
  private async withTotals(trainer: Trainer, ...conditions: SQL[]): Promise<PackageWithTotals[]> {
    const outer = sql.identifier("client_packages");
    const rows = await this.db.tx
      .select({
        pkg: clientPackages,
        used: sql<number>`coalesce((
          select sum(l.sessions_used) from ${packageSessionLedger} l
          where l.workspace_id = ${outer}.workspace_id and l.package_id = ${outer}.id
        ), 0)::int`,
        paid: sql<string>`coalesce((
          select sum(p.amount_paise) from ${clientPayments} p
          where p.workspace_id = ${outer}.workspace_id and p.package_id = ${outer}.id
            and p.voids_id is null
            and not exists (select 1 from ${clientPayments} v where v.voids_id = p.id)
        ), 0)::text`,
      })
      .from(clientPackages)
      .where(and(eq(clientPackages.workspaceId, trainer.workspaceId), ...conditions))
      .orderBy(desc(clientPackages.createdAt), desc(clientPackages.id));
    return rows.map((row) => ({ pkg: row.pkg, used: Number(row.used), paid: Number(row.paid) }));
  }

  private summarize({ pkg, used, paid }: PackageWithTotals, today: string): PackageSummary {
    const kind = pkg.kind as PackageKind;
    const sessionsLeft =
      kind === "session_pack" && pkg.sessionsIncluded !== null ? pkg.sessionsIncluded - used : null;
    const balance = Math.max(0, pkg.amountDuePaise - paid);
    const expired = pkg.status === "active" && pkg.expiresOn !== null && pkg.expiresOn < today;
    return {
      id: pkg.id,
      name: pkg.name,
      kind,
      status: expired ? "expired" : (pkg.status as PackageSummary["status"]),
      sessionsIncluded: pkg.sessionsIncluded,
      sessionsUsed: used,
      sessionsLeft,
      sessionsPerWeek: pkg.sessionsPerWeek,
      startsOn: pkg.startsOn,
      expiresOn: pkg.expiresOn,
      pricePaise: pkg.pricePaise,
      amountDuePaise: pkg.amountDuePaise,
      paidPaise: paid,
      balancePaise: balance,
      paymentDueOn: pkg.paymentDueOn,
      paymentOverdue: balance > 0 && pkg.paymentDueOn !== null && pkg.paymentDueOn <= today,
      notes: pkg.notes,
      closedReason: pkg.closedReason,
      createdAt: iso(pkg.createdAt),
      closedAt: pkg.closedAt ? iso(pkg.closedAt) : null,
    };
  }

  private async findClient(trainer: Trainer, clientId: string) {
    const [client] = await this.db.tx
      .select({ id: clients.id, status: clients.status, fullName: clients.fullName })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
    if (!client) throw clientNotFound();
    return client;
  }

  /** The overview card: the client's active package (shown as expired once past its date). */
  async card(clientId: string): Promise<PackageCard | null> {
    const trainer = this.trainer();
    const today = await this.today(trainer);
    const [active] = await this.withTotals(
      trainer,
      eq(clientPackages.clientId, clientId),
      eq(clientPackages.status, "active"),
    );
    if (!active) return null;
    const summary = this.summarize(active, today);
    return {
      id: summary.id,
      name: summary.name,
      kind: summary.kind,
      status: summary.status,
      sessionsIncluded: summary.sessionsIncluded,
      sessionsUsed: summary.sessionsUsed,
      sessionsLeft: summary.sessionsLeft,
      sessionsPerWeek: summary.sessionsPerWeek,
      expiresOn: summary.expiresOn,
      balancePaise: summary.balancePaise,
      paymentDueOn: summary.paymentDueOn,
      paymentOverdue: summary.paymentOverdue,
    };
  }

  async forClient(clientId: string): Promise<ClientPackagesResponse> {
    const trainer = this.trainer();
    await this.findClient(trainer, clientId);
    const today = await this.today(trainer);
    const all = (await this.withTotals(trainer, eq(clientPackages.clientId, clientId))).map((row) =>
      this.summarize(row, today),
    );
    const activeRow = all.find((pkg) => pkg.closedAt === null) ?? null;
    const names = new Map(all.map((pkg) => [pkg.id, pkg.name]));

    const paymentRows = await this.db.tx
      .select({ payment: clientPayments, packageClient: clientPackages.clientId })
      .from(clientPayments)
      .innerJoin(
        clientPackages,
        and(
          eq(clientPackages.id, clientPayments.packageId),
          eq(clientPackages.workspaceId, clientPayments.workspaceId),
        ),
      )
      .where(
        and(
          eq(clientPayments.workspaceId, trainer.workspaceId),
          eq(clientPackages.clientId, clientId),
        ),
      )
      .orderBy(desc(clientPayments.paidOn), desc(clientPayments.createdAt));
    const voids = new Map(
      paymentRows
        .filter(({ payment }) => payment.voidsId !== null)
        .map(({ payment }) => [payment.voidsId, payment]),
    );
    const payments: Payment[] = paymentRows
      .filter(({ payment }) => payment.voidsId === null)
      .map(({ payment }) => {
        const voided = voids.get(payment.id);
        return {
          id: payment.id,
          packageId: payment.packageId,
          packageName: names.get(payment.packageId) ?? "",
          amountPaise: payment.amountPaise,
          method: payment.method as PaymentMethod,
          paidOn: payment.paidOn,
          reference: payment.reference,
          note: payment.note,
          createdAt: iso(payment.createdAt),
          voided: voided ? { at: iso(voided.createdAt), reason: voided.voidReason ?? "" } : null,
        };
      });

    const ledger = activeRow ? await this.ledger(trainer, activeRow.id) : [];
    const [settings] = await this.db.tx
      .select({ low: trainerSettings.lowSessionsThreshold })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));

    return {
      active: activeRow,
      history: all.filter((pkg) => pkg !== activeRow),
      payments,
      ledger,
      lowSessionsThreshold: settings?.low ?? 2,
    };
  }

  private async ledger(trainer: Trainer, packageId: string): Promise<LedgerEntry[]> {
    const [workspace] = await this.db.tx
      .select({ timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    const timezone = workspace?.timezone ?? "Asia/Kolkata";
    const rows = await this.db.tx
      .select({
        entry: packageSessionLedger,
        date: sql<
          string | null
        >`to_char(${appointments.startsAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
        startTime: sql<
          string | null
        >`to_char(${appointments.startsAt} at time zone ${timezone}, 'HH24:MI')`,
      })
      .from(packageSessionLedger)
      .leftJoin(
        appointments,
        and(
          eq(appointments.id, packageSessionLedger.appointmentId),
          eq(appointments.workspaceId, packageSessionLedger.workspaceId),
        ),
      )
      .where(
        and(
          eq(packageSessionLedger.workspaceId, trainer.workspaceId),
          eq(packageSessionLedger.packageId, packageId),
        ),
      )
      // Rows written in one transaction share created_at (now() is the transaction time): when an
      // attended mark is switched to no-show, the reversal comes before the new mark.
      .orderBy(
        desc(packageSessionLedger.createdAt),
        desc(sql`${packageSessionLedger.reversesId} is null`),
        desc(packageSessionLedger.id),
      )
      .limit(200);
    return rows.map(({ entry, date, startTime }) => ({
      id: entry.id,
      packageId: entry.packageId,
      reason: entry.reason as LedgerReason,
      sessionsUsed: entry.sessionsUsed,
      reversal: entry.reversesId !== null,
      appointment:
        entry.appointmentId && date && startTime
          ? { id: entry.appointmentId, date, startTime }
          : null,
      note: entry.note,
      createdAt: iso(entry.createdAt),
    }));
  }

  /** The active package attendance would use, as the appointment drawer shows it. */
  async usableForAppointment(
    clientId: string,
  ): Promise<{ name: string; kind: PackageKind; sessionsLeft: number | null } | null> {
    const trainer = this.trainer();
    const today = await this.today(trainer);
    const [active] = await this.withTotals(
      trainer,
      eq(clientPackages.clientId, clientId),
      eq(clientPackages.status, "active"),
    );
    if (!active) return null;
    const summary = this.summarize(active, today);
    if (summary.status === "expired") return null;
    return { name: summary.name, kind: summary.kind, sessionsLeft: summary.sessionsLeft };
  }

  /** Net sessions an appointment used, and on which package. */
  async sessionUse(
    appointmentId: string,
  ): Promise<{ packageName: string; sessionsUsed: number } | null> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select({
        name: clientPackages.name,
        used: sql<number>`sum(${packageSessionLedger.sessionsUsed})::int`,
        last: sql<Date>`max(${packageSessionLedger.createdAt})`,
      })
      .from(packageSessionLedger)
      .innerJoin(
        clientPackages,
        and(
          eq(clientPackages.id, packageSessionLedger.packageId),
          eq(clientPackages.workspaceId, packageSessionLedger.workspaceId),
        ),
      )
      .where(
        and(
          eq(packageSessionLedger.workspaceId, trainer.workspaceId),
          eq(packageSessionLedger.appointmentId, appointmentId),
        ),
      )
      .groupBy(clientPackages.id, clientPackages.name)
      .orderBy(desc(sql`max(${packageSessionLedger.createdAt})`));
    const latest = rows[0];
    return latest ? { packageName: latest.name, sessionsUsed: Number(latest.used) } : null;
  }

  // -------------------------------------------------------------------------------------------
  // Selling, renewing and cancelling
  // -------------------------------------------------------------------------------------------

  sell(
    clientId: string,
    input: SellPackageRequest,
    idempotencyKey: string | undefined,
  ): Promise<ClientPackagesResponse> {
    return this.idempotency.run(
      `POST /v1/clients/${clientId}/packages`,
      idempotencyKey,
      input,
      async () => {
        await this.sellInTransaction(this.trainer(), clientId, input, "profile", true);
        return this.forClient(clientId);
      },
    );
  }

  /**
   * One transaction (rule 14): lock the client, close the active package when renewing, insert the
   * new one. Without `renew`, an active package is a conflict (conversion and onboarding).
   */
  async sellInTransaction(
    trainer: Trainer,
    clientId: string,
    input: SellPackageRequest,
    source: SaleSource,
    renew: boolean,
  ): Promise<string> {
    const [client] = await this.db.tx
      .select({ id: clients.id, status: clients.status })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)))
      .for("update");
    if (!client) throw clientNotFound();
    if (client.status === "archived") throw refuse("Restore this client before selling a package.");

    let presetId: string | null = null;
    if (input.presetId) {
      const [preset] = await this.db.tx
        .select({ id: packagePresets.id })
        .from(packagePresets)
        .where(
          and(
            eq(packagePresets.id, input.presetId),
            eq(packagePresets.workspaceId, trainer.workspaceId),
          ),
        );
      if (!preset) throw invalid({ presetId: ["That package preset doesn't exist"] });
      presetId = preset.id;
    }

    const today = await this.today(trainer);
    const [current] = await this.db.tx
      .select()
      .from(clientPackages)
      .where(
        and(
          eq(clientPackages.workspaceId, trainer.workspaceId),
          eq(clientPackages.clientId, clientId),
          eq(clientPackages.status, "active"),
        ),
      )
      .for("update");
    if (current) {
      if (!renew) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          `They already have an active package (${current.name}). Renew it from their profile.`,
          { initialPackage: ["They already have an active package"] },
        );
      }
      // Renewal closes the previous package: expired once past its date, otherwise completed.
      const expired = current.expiresOn !== null && current.expiresOn < today;
      await this.db.tx
        .update(clientPackages)
        .set({
          status: expired ? "expired" : "completed",
          closedAt: sql`now()`,
          closedReason: "Renewed",
        })
        .where(
          and(
            eq(clientPackages.id, current.id),
            eq(clientPackages.workspaceId, trainer.workspaceId),
          ),
        );
    }

    const [created] = await this.db.tx
      .insert(clientPackages)
      .values({
        workspaceId: trainer.workspaceId,
        clientId,
        presetId,
        name: input.name,
        kind: input.kind,
        sessionsIncluded: input.kind === "session_pack" ? input.sessionsIncluded : null,
        sessionsPerWeek: input.kind === "session_pack" ? null : input.sessionsPerWeek,
        startsOn: input.startsOn,
        expiresOn: input.expiresOn,
        pricePaise: input.pricePaise,
        amountDuePaise: input.amountDuePaise,
        paymentDueOn: input.paymentDueOn,
        notes: input.notes || null,
        createdByUserId: trainer.userId,
      })
      .returning({ id: clientPackages.id });
    if (!created) throw new Error("package insert returned no row");

    await this.log(trainer, clientId, "package_sold", {
      packageId: created.id,
      packageName: input.name,
      renewal: current !== undefined,
    });
    await trackEvent(this.db.tx, {
      event: "package_sold",
      actorKind: "trainer",
      userId: trainer.userId,
      workspaceId: trainer.workspaceId,
      properties: {
        kind: input.kind,
        renewal: current !== undefined,
        fromPreset: presetId !== null,
        source,
      },
    });
    return created.id;
  }

  /**
   * The quick sale during conversion or onboarding: a preset and its price. Name, kind, sessions and
   * expiry come from the preset (its duration counts the start day); the amount due is the price.
   */
  async sellInitial(
    trainer: Trainer,
    clientId: string,
    input: InitialPackage,
    defaultStart: string | null | undefined,
    source: SaleSource,
  ): Promise<string> {
    const [preset] = await this.db.tx
      .select()
      .from(packagePresets)
      .where(
        and(
          eq(packagePresets.id, input.presetId),
          eq(packagePresets.workspaceId, trainer.workspaceId),
          isNull(packagePresets.archivedAt),
        ),
      );
    if (!preset) throw invalid({ initialPackage: ["That package preset doesn't exist"] });
    const startsOn = input.startsOn ?? defaultStart ?? (await this.today(trainer));
    return this.sellInTransaction(
      trainer,
      clientId,
      {
        presetId: preset.id,
        name: preset.name,
        kind: preset.kind as PackageKind,
        sessionsIncluded: preset.sessionsIncluded,
        sessionsPerWeek: preset.sessionsPerWeek,
        startsOn,
        expiresOn: preset.durationDays ? addDays(startsOn, preset.durationDays - 1) : null,
        pricePaise: input.pricePaise,
        amountDuePaise: input.pricePaise,
        paymentDueOn: null,
      },
      source,
      false,
    );
  }

  private async lockPackage(trainer: Trainer, packageId: string): Promise<PackageRow> {
    const [pkg] = await this.db.tx
      .select()
      .from(clientPackages)
      .where(
        and(eq(clientPackages.id, packageId), eq(clientPackages.workspaceId, trainer.workspaceId)),
      )
      .for("update");
    if (pkg) return pkg;
    // FOR UPDATE applies the UPDATE policy, which hides closed packages: read it again unlocked.
    const [closed] = await this.db.tx
      .select()
      .from(clientPackages)
      .where(
        and(eq(clientPackages.id, packageId), eq(clientPackages.workspaceId, trainer.workspaceId)),
      );
    if (!closed) throw packageNotFound();
    return closed;
  }

  async cancel(packageId: string, input: CancelPackageRequest): Promise<ClientPackagesResponse> {
    const trainer = this.trainer();
    const pkg = await this.lockPackage(trainer, packageId);
    if (pkg.status !== "active") throw refuse("Only an active package can be cancelled.");
    await this.db.tx
      .update(clientPackages)
      .set({ status: "cancelled", closedAt: sql`now()`, closedReason: input.reason })
      .where(
        and(eq(clientPackages.id, packageId), eq(clientPackages.workspaceId, trainer.workspaceId)),
      );
    await this.log(trainer, pkg.clientId, "package_cancelled", {
      packageId,
      packageName: pkg.name,
      reason: input.reason,
    });
    return this.forClient(pkg.clientId);
  }

  // -------------------------------------------------------------------------------------------
  // Payments and adjustments
  // -------------------------------------------------------------------------------------------

  recordPayment(
    packageId: string,
    input: RecordPaymentRequest,
    idempotencyKey: string | undefined,
  ): Promise<ClientPackagesResponse> {
    return this.idempotency.run(
      `POST /v1/packages/${packageId}/payments`,
      idempotencyKey,
      input,
      async () => {
        const trainer = this.trainer();
        const pkg = await this.lockPackage(trainer, packageId);
        const [totals] = await this.withTotals(trainer, eq(clientPackages.id, packageId));
        const balance = Math.max(0, pkg.amountDuePaise - (totals?.paid ?? 0));
        if (input.amountPaise > balance) {
          throw invalid(
            {
              amountPaise: [
                balance === 0
                  ? "Nothing is due on this package"
                  : `Only ${formatInr(balance)} is still due`,
              ],
            },
            "That's more than is due on this package.",
          );
        }
        await this.db.tx.insert(clientPayments).values({
          workspaceId: trainer.workspaceId,
          packageId,
          amountPaise: input.amountPaise,
          method: input.method,
          paidOn: input.paidOn,
          reference: input.reference || null,
          note: input.note || null,
          recordedByUserId: trainer.userId,
        });
        await this.log(trainer, pkg.clientId, "payment_recorded", {
          packageId,
          packageName: pkg.name,
          amountPaise: input.amountPaise,
          method: input.method,
        });
        await trackEvent(this.db.tx, {
          event: "payment_recorded",
          actorKind: "trainer",
          userId: trainer.userId,
          workspaceId: trainer.workspaceId,
          properties: { method: input.method, settled: input.amountPaise === balance },
        });
        return this.forClient(pkg.clientId);
      },
    );
  }

  /** A correction: a voiding row pointing at the payment, never an edit (§8.3A). */
  async voidPayment(paymentId: string, input: VoidPaymentRequest): Promise<ClientPackagesResponse> {
    const trainer = this.trainer();
    const [payment] = await this.db.tx
      .select()
      .from(clientPayments)
      .where(
        and(eq(clientPayments.id, paymentId), eq(clientPayments.workspaceId, trainer.workspaceId)),
      );
    if (!payment || payment.voidsId !== null) {
      throw DomainError.notFound("That payment doesn't exist.");
    }
    const pkg = await this.lockPackage(trainer, payment.packageId);
    const [already] = await this.db.tx
      .select({ id: clientPayments.id })
      .from(clientPayments)
      .where(
        and(
          eq(clientPayments.workspaceId, trainer.workspaceId),
          eq(clientPayments.voidsId, paymentId),
        ),
      );
    if (already) throw refuse("This payment is already voided.");
    await this.db.tx.insert(clientPayments).values({
      workspaceId: trainer.workspaceId,
      packageId: payment.packageId,
      amountPaise: payment.amountPaise,
      method: payment.method,
      paidOn: payment.paidOn,
      voidsId: payment.id,
      voidReason: input.reason,
      recordedByUserId: trainer.userId,
    });
    await this.log(trainer, pkg.clientId, "payment_voided", {
      packageId: pkg.id,
      packageName: pkg.name,
      amountPaise: payment.amountPaise,
      reason: input.reason,
    });
    return this.forClient(pkg.clientId);
  }

  /** Use or give back sessions by hand, with a note (§8.3A). Session packs only. */
  async adjust(
    packageId: string,
    input: SessionAdjustmentRequest,
  ): Promise<ClientPackagesResponse> {
    const trainer = this.trainer();
    const pkg = await this.lockPackage(trainer, packageId);
    if (pkg.status !== "active") throw refuse("Only an active package can be adjusted.");
    if (pkg.kind !== "session_pack" || pkg.sessionsIncluded === null) {
      throw refuse("Time-based and online packages don't count sessions.");
    }
    const [totals] = await this.withTotals(trainer, eq(clientPackages.id, packageId));
    const used = (totals?.used ?? 0) + input.sessions;
    if (used > pkg.sessionsIncluded) {
      throw invalid({
        sessions: [`Only ${pkg.sessionsIncluded - (totals?.used ?? 0)} sessions are left`],
      });
    }
    if (used < 0) {
      throw invalid({ sessions: [`Only ${totals?.used ?? 0} sessions have been used`] });
    }
    await this.db.tx.insert(packageSessionLedger).values({
      workspaceId: trainer.workspaceId,
      packageId,
      reason: "manual_adjustment",
      sessionsUsed: input.sessions,
      note: input.note,
      actorUserId: trainer.userId,
    });
    await this.log(trainer, pkg.clientId, "sessions_adjusted", {
      packageId,
      packageName: pkg.name,
      sessions: input.sessions,
      note: input.note,
    });
    return this.forClient(pkg.clientId);
  }

  private async log(
    trainer: Trainer,
    clientId: string,
    type:
      | "package_sold"
      | "package_cancelled"
      | "payment_recorded"
      | "payment_voided"
      | "sessions_adjusted",
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.db.tx.insert(activityEvents).values({
      workspaceId: trainer.workspaceId,
      type,
      clientId,
      data,
      actorUserId: trainer.userId,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Client list filters (§8.3A): conditions on the outer `clients` row.
  // -------------------------------------------------------------------------------------------

  /** Active package with sessions left ≤ threshold, or expiring within the warning window. */
  lowSessionsCondition(today: string, threshold: number, warningDays: number): SQL {
    const outer = sql.identifier("clients");
    return sql`exists (
      select 1 from ${clientPackages} p
      where p.workspace_id = ${outer}.workspace_id and p.client_id = ${outer}.id
        and p.status = 'active'
        and (
          (p.kind = 'session_pack' and p.sessions_included - coalesce((
            select sum(l.sessions_used) from ${packageSessionLedger} l
            where l.workspace_id = p.workspace_id and l.package_id = p.id
          ), 0) <= ${threshold})
          or (p.expires_on is not null and p.expires_on <= ${today}::date + ${warningDays}::int)
        )
    )`;
  }

  /** Active package with a balance whose payment due date has come. */
  paymentDueCondition(today: string): SQL {
    const outer = sql.identifier("clients");
    return sql`exists (
      select 1 from ${clientPackages} p
      where p.workspace_id = ${outer}.workspace_id and p.client_id = ${outer}.id
        and p.status = 'active' and p.payment_due_on is not null and p.payment_due_on <= ${today}::date
        and p.amount_due_paise > coalesce((
          select sum(c.amount_paise) from ${clientPayments} c
          where c.workspace_id = p.workspace_id and c.package_id = p.id and c.voids_id is null
            and not exists (select 1 from ${clientPayments} v where v.voids_id = c.id)
        ), 0)
    )`;
  }
}
