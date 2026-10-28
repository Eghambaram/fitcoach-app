import { Injectable } from "@nestjs/common";
import {
  CHECK_IN_PAGE_SIZE,
  type CheckIn,
  type CheckInInput,
  type CheckInListQuery,
  type CheckInListResponse,
  type CheckInSettings,
  type ClientCheckInResponse,
  type ClientCheckInsResponse,
  ERROR_CODES,
  FEELING_SCORES,
  type Feeling,
  type ReviewCheckInRequest,
  type Soreness,
  type TrainerCheckIn,
  type UpdateCheckInSettingsRequest,
} from "@fitcoach/shared";
import { and, asc, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { AppConfig } from "../../config/env";
import { DbContext } from "../../db/db-context";
import {
  checkIns,
  clients,
  profiles,
  trainerSettings,
  workspaceMembers,
  workspaces,
} from "../../db/schema";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { readFeatures } from "../client-portal/portal-access.service";
import { notify } from "../notifications/notify";

type CheckInRow = typeof checkIns.$inferSelect;
type Trainer = { userId: string; workspaceId: string };
type ClientScope = { userId: string; workspaceId: string; clientId: string };

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const notFound = () => DomainError.notFound("That check-in doesn't exist.");
const clientNotFound = () => DomainError.notFound("That client doesn't exist.");

/** YYYY-MM-DD + n days (UTC steps). */
function addDays(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function isoWeekday(day: string): number {
  const value = new Date(`${day}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
}

/**
 * The days a client checks in: their own weekdays, else the workspace default ("daily" = every
 * day, "weekly" = Mondays). See ADR-0057.
 */
export function effectiveDays(days: number[] | null, frequency: string | null): number[] {
  if (days && days.length > 0) return [...days].sort((a, b) => a - b);
  return frequency === "weekly" ? [1] : ALL_DAYS;
}

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    localDate: row.localDate,
    feeling: row.feeling as Feeling,
    energy: row.energy,
    sleep: row.sleep,
    soreness: row.soreness as Soreness,
    notes: row.notes,
    workoutFeedback: row.workoutFeedback,
    edited: row.revisions > 0,
    submittedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reply: row.reply,
  };
}

/**
 * Check-ins (PROMPT §8.7): the client submits today's (one per local date, editable until local
 * midnight; edits keep the previous values and send it back for review), the trainer reviews them in
 * an inbox and per client. Runs as fitcoach_app; RLS (migration 0035) enforces the same rules.
 */
@Injectable()
export class CheckInsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: AppConfig,
    private readonly whatsApp: WhatsAppLinkBuilder,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { userId: auth.userId, workspaceId: auth.workspaceId };
  }

  private client(): ClientScope {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "client" || !auth.workspaceId || !auth.clientId) {
      throw DomainError.forbidden();
    }
    return { userId: auth.userId, workspaceId: auth.workspaceId, clientId: auth.clientId };
  }

  private async today(): Promise<string> {
    const result = await this.db.tx.execute<{ today: string }>(
      sql`select app.workspace_today()::text as today`,
    );
    const today = result.rows[0]?.today;
    if (!today) throw DomainError.forbidden();
    return today;
  }

  // -------------------------------------------------------------------------------------------
  // Client
  // -------------------------------------------------------------------------------------------

  /** The signed-in client's check-in settings (used by the home prompt too). */
  async clientState(scope: ClientScope = this.client()) {
    const [client] = await this.db.tx
      .select({ features: clients.features, checkInDays: clients.checkInDays })
      .from(clients)
      .where(and(eq(clients.id, scope.clientId), eq(clients.workspaceId, scope.workspaceId)));
    if (!client) throw DomainError.forbidden();
    const frequency = await this.db.tx.execute<{ frequency: string | null }>(
      sql`select app.client_check_in_frequency() as frequency`,
    );
    const today = await this.today();
    const [todays] = await this.db.tx
      .select()
      .from(checkIns)
      .where(
        and(
          eq(checkIns.workspaceId, scope.workspaceId),
          eq(checkIns.clientId, scope.clientId),
          eq(checkIns.localDate, today),
        ),
      );
    const enabled = readFeatures(client.features).checkIns;
    const days = effectiveDays(client.checkInDays, frequency.rows[0]?.frequency ?? null);
    return {
      today,
      enabled,
      todays: todays ?? null,
      due: enabled && days.includes(isoWeekday(today)) && !todays,
    };
  }

  async forClient(): Promise<ClientCheckInResponse> {
    const scope = this.client();
    const state = await this.clientState(scope);
    const recent = await this.db.tx
      .select()
      .from(checkIns)
      .where(
        and(
          eq(checkIns.workspaceId, scope.workspaceId),
          eq(checkIns.clientId, scope.clientId),
          gte(checkIns.localDate, addDays(state.today, -14)),
          sql`${checkIns.localDate} < ${state.today}`,
        ),
      )
      .orderBy(desc(checkIns.localDate));
    const [trainer] = await this.db.tx
      .select({ name: profiles.displayName })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.userId, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, scope.workspaceId))
      .limit(1);
    return {
      today: state.today,
      enabled: state.enabled,
      due: state.due,
      trainerName: trainer?.name ?? "your trainer",
      todays: state.todays ? toCheckIn(state.todays) : null,
      recent: recent.map(toCheckIn),
    };
  }

  /** Sends or edits today's check-in (one per local date; editable until local midnight). */
  async submit(input: CheckInInput): Promise<ClientCheckInResponse> {
    const scope = this.client();
    const state = await this.clientState(scope);
    if (!state.enabled) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN,
        403,
        "Check-ins are turned off for you. Ask your trainer if you'd like to send them.",
      );
    }
    const values = {
      feeling: input.feeling,
      energy: input.energy,
      sleep: input.sleep,
      soreness: input.soreness,
      notes: input.notes || null,
      workoutFeedback: input.workoutFeedback || null,
    };
    // Insert today's, or edit it if it exists (also under a concurrent double submit).
    const [saved] = await this.db.tx
      .insert(checkIns)
      .values({
        workspaceId: scope.workspaceId,
        clientId: scope.clientId,
        localDate: state.today,
        ...values,
      })
      .onConflictDoUpdate({
        target: [checkIns.clientId, checkIns.localDate],
        set: values,
      })
      .returning({ id: checkIns.id });
    const [owner] = await this.db.tx
      .select({ userId: workspaces.ownerUserId, name: clients.fullName })
      .from(workspaces)
      .innerJoin(clients, eq(clients.workspaceId, workspaces.id))
      .where(and(eq(workspaces.id, scope.workspaceId), eq(clients.id, scope.clientId)));
    if (saved && owner) {
      await notify(this.db.tx, {
        workspaceId: scope.workspaceId,
        recipientUserId: owner.userId,
        type: "check_in_submitted",
        title: `Check-in from ${owner.name}`,
        body: `Feeling ${input.feeling}, energy ${input.energy}/10, sleep ${input.sleep}/10 (self-reported)`,
        link: "/app/check-ins",
        data: { checkInId: saved.id },
        dedupeKey: `check_in:${saved.id}`,
      });
    }
    return this.forClient();
  }

  // -------------------------------------------------------------------------------------------
  // Trainer
  // -------------------------------------------------------------------------------------------

  private async withClient(trainer: Trainer, where: SQL[], offset: number, limit: number) {
    return this.db.tx
      .select({ checkIn: checkIns, fullName: clients.fullName })
      .from(checkIns)
      .innerJoin(
        clients,
        and(eq(clients.workspaceId, checkIns.workspaceId), eq(clients.id, checkIns.clientId)),
      )
      .where(and(eq(checkIns.workspaceId, trainer.workspaceId), ...where))
      .orderBy(
        sql`(${checkIns.reviewedAt} is null) desc`,
        desc(checkIns.localDate),
        desc(checkIns.updatedAt),
      )
      .offset(offset)
      .limit(limit);
  }

  private toTrainerCheckIn(row: { checkIn: CheckInRow; fullName: string }): TrainerCheckIn {
    return {
      ...toCheckIn(row.checkIn),
      client: { id: row.checkIn.clientId, fullName: row.fullName },
    };
  }

  /** The inbox: unreviewed first, then newest (§8.7). */
  async list(query: CheckInListQuery): Promise<CheckInListResponse> {
    const trainer = this.trainer();
    const where: SQL[] = [];
    if (query.status === "unreviewed") where.push(sql`${checkIns.reviewedAt} is null`);
    if (query.status === "reviewed") where.push(sql`${checkIns.reviewedAt} is not null`);
    if (query.clientId) where.push(eq(checkIns.clientId, query.clientId));
    if (query.feeling) where.push(eq(checkIns.feeling, query.feeling));
    const rows = await this.withClient(trainer, where, query.offset, CHECK_IN_PAGE_SIZE + 1);
    const [counts] = await this.db.tx
      .select({
        unreviewed: sql<number>`count(*) filter (where ${checkIns.reviewedAt} is null)::int`,
        reviewed: sql<number>`count(*) filter (where ${checkIns.reviewedAt} is not null)::int`,
      })
      .from(checkIns)
      .where(eq(checkIns.workspaceId, trainer.workspaceId));
    return {
      items: rows.slice(0, CHECK_IN_PAGE_SIZE).map((row) => this.toTrainerCheckIn(row)),
      counts: { unreviewed: counts?.unreviewed ?? 0, reviewed: counts?.reviewed ?? 0 },
      hasMore: rows.length > CHECK_IN_PAGE_SIZE,
    };
  }

  /** Marks a check-in reviewed, optionally replying; reviewing again keeps an earlier reply. */
  async review(id: string, input: ReviewCheckInRequest): Promise<TrainerCheckIn> {
    const trainer = this.trainer();
    const mine = and(eq(checkIns.id, id), eq(checkIns.workspaceId, trainer.workspaceId));
    const [existing] = await this.db.tx.select().from(checkIns).where(mine).for("update");
    if (!existing) throw notFound();
    await this.db.tx
      .update(checkIns)
      .set({
        reviewedAt: sql`now()`,
        reviewedByUserId: trainer.userId,
        reply: input.reply ? input.reply : existing.reply,
      })
      .where(mine);
    const [row] = await this.withClient(trainer, [eq(checkIns.id, id)], 0, 1);
    if (!row) throw notFound();
    return this.toTrainerCheckIn(row);
  }

  private async trainerClient(trainer: Trainer, clientId: string, lock = false) {
    const query = this.db.tx
      .select({
        id: clients.id,
        fullName: clients.fullName,
        phoneE164: clients.phoneE164,
        features: clients.features,
        checkInDays: clients.checkInDays,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw clientNotFound();
    return row;
  }

  private async frequency(trainer: Trainer): Promise<string | null> {
    const [row] = await this.db.tx
      .select({ frequency: trainerSettings.checkInFrequency })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    return row?.frequency ?? null;
  }

  private settings(
    client: { features: unknown; checkInDays: number[] | null },
    frequency: string | null,
  ): CheckInSettings {
    return {
      enabled: readFeatures(client.features).checkIns,
      days: client.checkInDays,
      effectiveDays: effectiveDays(client.checkInDays, frequency),
    };
  }

  /** Client profile → Check-ins: settings, the last 60 days, trends and the Nudge link. */
  async clientCheckIns(clientId: string): Promise<ClientCheckInsResponse> {
    const trainer = this.trainer();
    const client = await this.trainerClient(trainer, clientId);
    const today = await this.today();
    const rows = await this.db.tx
      .select()
      .from(checkIns)
      .where(
        and(
          eq(checkIns.workspaceId, trainer.workspaceId),
          eq(checkIns.clientId, client.id),
          gte(checkIns.localDate, addDays(today, -60)),
        ),
      )
      .orderBy(asc(checkIns.localDate));
    const settings = this.settings(client, await this.frequency(trainer));
    const sentToday = rows.some((row) => row.localDate === today);
    const context = await this.whatsApp.context(
      trainer.workspaceId,
      trainer.userId,
      "check_in_nudge",
    );
    return {
      today,
      settings,
      items: rows.map(toCheckIn).reverse(),
      trend: rows.map((row) => ({
        date: row.localDate,
        energy: row.energy,
        sleep: row.sleep,
        feeling: FEELING_SCORES[row.feeling as Feeling],
      })),
      dueToday:
        settings.enabled && settings.effectiveDays.includes(isoWeekday(today)) && !sentToday,
      nudge: settings.enabled
        ? this.whatsApp.build(context, client, { link: `${this.config.webOrigin}/client/check-in` })
        : null,
    };
  }

  async updateSettings(
    clientId: string,
    input: UpdateCheckInSettingsRequest,
  ): Promise<ClientCheckInsResponse> {
    const trainer = this.trainer();
    const client = await this.trainerClient(trainer, clientId, true);
    await this.db.tx
      .update(clients)
      .set({
        features: { ...readFeatures(client.features), checkIns: input.enabled },
        checkInDays: input.days ? [...input.days].sort((a, b) => a - b) : null,
      })
      .where(and(eq(clients.id, client.id), eq(clients.workspaceId, trainer.workspaceId)));
    return this.clientCheckIns(clientId);
  }
}
