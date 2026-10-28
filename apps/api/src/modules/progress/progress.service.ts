import { Injectable } from "@nestjs/common";
import {
  type AddMeasurementRequest,
  type ClientProgressResponse,
  type CreateMeasurementTypeRequest,
  ERROR_CODES,
  type LengthUnit,
  type MeasurementType,
  type MeasurementTypesResponse,
  measurementRange,
  type Metric,
  type PortalProgressResponse,
  type ProgressOverviewResponse,
  type SharedMetricTile,
  toCm,
  toKg,
  type UnitKind,
  unitsFor,
  type UpdateProgressSharesRequest,
  type VoidMeasurementRequest,
  type WeightUnit,
} from "@fitcoach/shared";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  clients,
  measurements,
  measurementTypes,
  progressShares,
  trainerSettings,
} from "../../db/schema";
import { readFeatures } from "../client-portal/portal-access.service";

type Scope = { userId: string; workspaceId: string; clientId: string | null };
type TypeRow = typeof measurementTypes.$inferSelect;
type MeasurementRow = typeof measurements.$inferSelect;
type Units = { weightUnit: WeightUnit; lengthUnit: LengthUnit };

const clientNotFound = () => DomainError.notFound("That client doesn't exist.");
const invalid = (fieldErrors: Record<string, string[]>, message = "Some details need fixing.") =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, message, fieldErrors);

function toType(row: TypeRow): MeasurementType {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    unitKind: row.unitKind as UnitKind,
    custom: row.workspaceId !== null,
  };
}

/** A key for a custom type from its name: "Arm (left)" → "arm_left". */
function keyFrom(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return /^[a-z]/.test(base) ? base : `m_${base}`.slice(0, 30);
}

/** Change between the first and latest live values; % only for body weight (§8.8). */
function summarize(type: TypeRow, points: MeasurementRow[]) {
  const first = points[0];
  const latest = points.at(-1);
  const change =
    first && latest && points.length >= 2
      ? Math.round((latest.value - first.value) * 100) / 100
      : null;
  return {
    first: first ? { measuredOn: first.measuredOn, value: first.value } : null,
    latest: latest ? { measuredOn: latest.measuredOn, value: latest.value } : null,
    change,
    percentChange:
      change !== null && first && type.key === "weight"
        ? Math.round((change / first.value) * 1000) / 10
        : null,
  };
}

/**
 * Progress (PROMPT §8.8): append-only measurements in canonical units (kg, cm, %) with void +
 * re-enter for corrections (rule 16), custom measurement types, per-metric sharing (default
 * nothing) and the client's view of shared metrics only. Runs as fitcoach_app; RLS (migration 0037)
 * enforces sharing and self-logging for clients.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private trainer(): Scope & { clientId: null } {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { userId: auth.userId, workspaceId: auth.workspaceId, clientId: null };
  }

  private client(): Scope & { clientId: string } {
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

  /** Global types and the workspace's own active ones, in display order. */
  private async typeRows(scope: Scope): Promise<TypeRow[]> {
    return this.db.tx
      .select()
      .from(measurementTypes)
      .where(
        and(
          or(
            isNull(measurementTypes.workspaceId),
            eq(measurementTypes.workspaceId, scope.workspaceId),
          ),
          eq(measurementTypes.isActive, true),
        ),
      )
      .orderBy(
        sql`${measurementTypes.workspaceId} is not null`,
        asc(measurementTypes.sortOrder),
        asc(measurementTypes.name),
      );
  }

  private async sharedTypeIds(scope: Scope, clientId: string): Promise<Set<string>> {
    const rows = await this.db.tx
      .select({ typeId: progressShares.typeId })
      .from(progressShares)
      .where(
        and(
          eq(progressShares.workspaceId, scope.workspaceId),
          eq(progressShares.clientId, clientId),
        ),
      );
    return new Set(rows.map((row) => row.typeId));
  }

  /** Metrics with values (and, for the client view, every shared one), oldest value first. */
  private async metrics(
    scope: Scope,
    clientId: string,
    audience: "trainer" | "client",
  ): Promise<Metric[]> {
    const types = await this.typeRows(scope);
    const shared = await this.sharedTypeIds(scope, clientId);
    // RLS shows a client only shared metrics; the filter here keeps the same rule explicit.
    const rows = await this.db.tx
      .select()
      .from(measurements)
      .where(
        and(eq(measurements.workspaceId, scope.workspaceId), eq(measurements.clientId, clientId)),
      )
      .orderBy(asc(measurements.measuredOn), asc(measurements.createdAt));
    return types.flatMap((type) => {
      const ofType = rows.filter((row) => row.typeId === type.id);
      const live = ofType.filter((row) => row.voidedAt === null);
      const show =
        audience === "client" ? shared.has(type.id) : live.length > 0 || shared.has(type.id);
      if (!show) return [];
      const point = (row: MeasurementRow) => ({
        id: row.id,
        measuredOn: row.measuredOn,
        value: row.value,
        source: row.source as "trainer" | "client",
        note: audience === "trainer" ? row.note : null,
        recordedAt: row.createdAt.toISOString(),
      });
      return [
        {
          type: toType(type),
          shared: shared.has(type.id),
          points: live.map(point),
          voided:
            audience === "trainer"
              ? ofType
                  .filter((row) => row.voidedAt !== null)
                  .reverse()
                  .map((row) => ({
                    ...point(row),
                    voidedAt: row.voidedAt?.toISOString() ?? "",
                    voidReason: row.voidReason ?? "",
                  }))
              : [],
          ...summarize(type, live),
        },
      ];
    });
  }

  private async workspaceUnits(scope: Scope): Promise<Units> {
    const [row] = await this.db.tx
      .select({ weightUnit: trainerSettings.weightUnit, lengthUnit: trainerSettings.lengthUnit })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, scope.workspaceId));
    return {
      weightUnit: (row?.weightUnit ?? "kg") as WeightUnit,
      lengthUnit: (row?.lengthUnit ?? "cm") as LengthUnit,
    };
  }

  /** The value in canonical units, checked against the metric's plausible range. */
  private async canonical(
    scope: Scope,
    input: AddMeasurementRequest,
  ): Promise<{ type: TypeRow; value: number }> {
    const type = (await this.typeRows(scope)).find((row) => row.id === input.typeId);
    if (!type) throw invalid({ typeId: ["Choose a measurement"] });
    const kind = type.unitKind as UnitKind;
    if (!unitsFor(kind).includes(input.unit)) {
      throw invalid({ unit: [`Use ${unitsFor(kind).join(" or ")}`] });
    }
    const value =
      input.unit === "kg" || input.unit === "lb"
        ? toKg(input.value, input.unit)
        : input.unit === "cm" || input.unit === "in"
          ? toCm(input.value, input.unit)
          : Math.round(input.value * 100) / 100;
    const [min, max] = measurementRange(type.key, kind);
    if (value < min || value > max) {
      throw invalid({ value: ["That looks wrong. Check the number and the unit."] });
    }
    const today = await this.today();
    if (input.measuredOn > today)
      throw invalid({ measuredOn: ["Choose today or an earlier date"] });
    if (input.measuredOn < "2000-01-01") throw invalid({ measuredOn: ["Choose a later date"] });
    return { type, value };
  }

  // -------------------------------------------------------------------------------------------
  // Trainer
  // -------------------------------------------------------------------------------------------

  private async trainerClient(scope: Scope, clientId: string, lock = false) {
    const query = this.db.tx
      .select({ id: clients.id, features: clients.features, status: clients.status })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, scope.workspaceId)));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw clientNotFound();
    return row;
  }

  async types(): Promise<MeasurementTypesResponse> {
    return { types: (await this.typeRows(this.trainer())).map(toType) };
  }

  async createType(input: CreateMeasurementTypeRequest): Promise<MeasurementType> {
    const scope = this.trainer();
    const existing = await this.typeRows(scope);
    if (existing.some((row) => row.name.toLowerCase() === input.name.toLowerCase())) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_DUPLICATE,
        409,
        "That measurement already exists.",
        {
          name: ["That measurement already exists"],
        },
      );
    }
    const taken = new Set(existing.map((row) => row.key));
    const base = keyFrom(input.name);
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
    const [row] = await this.db.tx
      .insert(measurementTypes)
      .values({
        workspaceId: scope.workspaceId,
        key,
        name: input.name,
        unitKind: input.unitKind,
        sortOrder: 100 + existing.filter((type) => type.workspaceId !== null).length,
      })
      .returning();
    if (!row) throw new Error("measurement type insert returned no row");
    return toType(row);
  }

  async clientProgress(clientId: string): Promise<ClientProgressResponse> {
    const scope = this.trainer();
    const client = await this.trainerClient(scope, clientId);
    return {
      today: await this.today(),
      units: await this.workspaceUnits(scope),
      selfLogging: readFeatures(client.features).progressSelfLogging,
      metrics: await this.metrics(scope, client.id, "trainer"),
      types: (await this.typeRows(scope)).map(toType),
    };
  }

  async add(clientId: string, input: AddMeasurementRequest): Promise<ClientProgressResponse> {
    const scope = this.trainer();
    const client = await this.trainerClient(scope, clientId);
    if (client.status === "archived") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "Restore this client to add measurements.",
      );
    }
    const { type, value } = await this.canonical(scope, input);
    await this.db.tx.insert(measurements).values({
      workspaceId: scope.workspaceId,
      clientId: client.id,
      typeId: type.id,
      value,
      measuredOn: input.measuredOn,
      source: "trainer",
      note: input.note || null,
      recordedByUserId: scope.userId,
    });
    return this.clientProgress(clientId);
  }

  /** A correction: the value stays in history, marked void with the reason (rule 16). */
  async void(id: string, input: VoidMeasurementRequest): Promise<ClientProgressResponse> {
    const scope = this.trainer();
    const where = and(eq(measurements.id, id), eq(measurements.workspaceId, scope.workspaceId));
    const columns = { clientId: measurements.clientId, voidedAt: measurements.voidedAt };
    // FOR UPDATE applies the void policy too, which hides voided rows: read those without a lock.
    const [locked] = await this.db.tx.select(columns).from(measurements).where(where).for("update");
    const [row] = locked
      ? [locked]
      : await this.db.tx.select(columns).from(measurements).where(where);
    if (!row) throw DomainError.notFound("That measurement doesn't exist.");
    if (row.voidedAt) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "That value was already corrected.");
    }
    await this.db.tx
      .update(measurements)
      .set({ voidedAt: sql`now()`, voidedByUserId: scope.userId, voidReason: input.reason })
      .where(and(eq(measurements.id, id), eq(measurements.workspaceId, scope.workspaceId)));
    return this.clientProgress(row.clientId);
  }

  /** Replaces what the client sees (default nothing) and whether they may add their own. */
  async setSharing(
    clientId: string,
    input: UpdateProgressSharesRequest,
  ): Promise<ClientProgressResponse> {
    const scope = this.trainer();
    const client = await this.trainerClient(scope, clientId, true);
    const available = new Set((await this.typeRows(scope)).map((row) => row.id));
    const wanted = [...new Set(input.typeIds)];
    if (wanted.some((id) => !available.has(id))) {
      throw invalid({ typeIds: ["Choose measurements from your list"] });
    }
    const current = await this.sharedTypeIds(scope, client.id);
    const removed = [...current].filter((id) => !wanted.includes(id));
    if (removed.length > 0) {
      await this.db.tx
        .delete(progressShares)
        .where(
          and(
            eq(progressShares.workspaceId, scope.workspaceId),
            eq(progressShares.clientId, client.id),
            inArray(progressShares.typeId, removed),
          ),
        );
    }
    const added = wanted.filter((id) => !current.has(id));
    if (added.length > 0) {
      await this.db.tx.insert(progressShares).values(
        added.map((typeId) => ({
          workspaceId: scope.workspaceId,
          clientId: client.id,
          typeId,
          createdByUserId: scope.userId,
        })),
      );
    }
    await this.db.tx
      .update(clients)
      .set({
        features: { ...readFeatures(client.features), progressSelfLogging: input.selfLogging },
      })
      .where(and(eq(clients.id, client.id), eq(clients.workspaceId, scope.workspaceId)));
    return this.clientProgress(clientId);
  }

  /**
   * Each client's own recent changes (last 90 days, up to three metrics), newest activity first.
   * Never averages across clients (§8.8).
   */
  async overview(): Promise<ProgressOverviewResponse> {
    const scope = this.trainer();
    const today = await this.today();
    const result = await this.db.tx.execute<{
      client_id: string;
      full_name: string;
      type_name: string;
      unit_kind: UnitKind;
      sort_order: number;
      first_value: string;
      first_on: string;
      latest_value: string;
      latest_on: string;
      points: number;
    }>(sql`
      with live as (
        select m.client_id, m.type_id, m.value, m.measured_on,
          row_number() over (partition by m.client_id, m.type_id order by m.measured_on, m.created_at) as asc_n,
          row_number() over (partition by m.client_id, m.type_id order by m.measured_on desc, m.created_at desc) as desc_n,
          count(*) over (partition by m.client_id, m.type_id) as points
        from ${measurements} m
        join ${clients} c on c.workspace_id = m.workspace_id and c.id = m.client_id
        where m.workspace_id = ${scope.workspaceId} and m.voided_at is null
          and c.status <> 'archived'
          and m.measured_on >= ${today}::date - 90
      )
      select f.client_id, c.full_name, t.name as type_name, t.unit_kind, t.sort_order,
        f.value::text as first_value, f.measured_on::text as first_on,
        l.value::text as latest_value, l.measured_on::text as latest_on, f.points::int as points
      from live f
      join live l on l.client_id = f.client_id and l.type_id = f.type_id and l.desc_n = 1
      join ${clients} c on c.workspace_id = ${scope.workspaceId} and c.id = f.client_id
      join ${measurementTypes} t on t.id = f.type_id
      where f.asc_n = 1
      order by l.measured_on desc`);
    const byClient = new Map<
      string,
      ProgressOverviewResponse["clients"][number] & { order: number[] }
    >();
    for (const row of result.rows) {
      const entry = byClient.get(row.client_id) ?? {
        id: row.client_id,
        fullName: row.full_name,
        lastMeasuredOn: row.latest_on,
        changes: [],
        order: [],
      };
      if (row.latest_on > entry.lastMeasuredOn) entry.lastMeasuredOn = row.latest_on;
      const latest = Number(row.latest_value);
      const points = Number(row.points);
      entry.changes.push({
        name: row.type_name,
        unitKind: row.unit_kind,
        latest,
        change: points >= 2 ? Math.round((latest - Number(row.first_value)) * 100) / 100 : null,
        since: points >= 2 ? row.first_on : null,
      });
      entry.order.push(Number(row.sort_order));
      byClient.set(row.client_id, entry);
    }
    const clientsList = [...byClient.values()]
      .map(({ order, changes, ...rest }) => ({
        ...rest,
        changes: changes
          .map((change, index) => ({ change, order: order[index] ?? 0 }))
          .sort((a, b) => a.order - b.order)
          .slice(0, 3)
          .map((item) => item.change),
      }))
      .sort((a, b) => b.lastMeasuredOn.localeCompare(a.lastMeasuredOn))
      .slice(0, 100);
    return { units: await this.workspaceUnits(scope), clients: clientsList };
  }

  // -------------------------------------------------------------------------------------------
  // Client
  // -------------------------------------------------------------------------------------------

  private async clientUnits(): Promise<Units> {
    const result = await this.db.tx.execute<{ weight_unit: WeightUnit; length_unit: LengthUnit }>(
      sql`select * from app.client_default_units()`,
    );
    const scope = this.client();
    const [own] = await this.db.tx
      .select({ weightUnit: clients.weightUnit, lengthUnit: clients.lengthUnit })
      .from(clients)
      .where(and(eq(clients.id, scope.clientId), eq(clients.workspaceId, scope.workspaceId)));
    return {
      weightUnit: (own?.weightUnit ?? result.rows[0]?.weight_unit ?? "kg") as WeightUnit,
      lengthUnit: (own?.lengthUnit ?? result.rows[0]?.length_unit ?? "cm") as LengthUnit,
    };
  }

  private async canClientLog(scope: Scope & { clientId: string }): Promise<boolean> {
    const [row] = await this.db.tx
      .select({ features: clients.features })
      .from(clients)
      .where(and(eq(clients.id, scope.clientId), eq(clients.workspaceId, scope.workspaceId)));
    return row ? readFeatures(row.features).progressSelfLogging : false;
  }

  async forClient(): Promise<PortalProgressResponse> {
    const scope = this.client();
    return {
      today: await this.today(),
      units: await this.clientUnits(),
      canLog: await this.canClientLog(scope),
      metrics: await this.metrics(scope, scope.clientId, "client"),
    };
  }

  /** The client adds a value of a shared metric, with progress self-logging on. */
  async addOwn(input: AddMeasurementRequest): Promise<PortalProgressResponse> {
    const scope = this.client();
    if (!(await this.canClientLog(scope))) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN,
        403,
        "Your trainer records your measurements. Ask them if you'd like to add your own.",
      );
    }
    const shared = await this.sharedTypeIds(scope, scope.clientId);
    if (!shared.has(input.typeId)) throw invalid({ typeId: ["Choose one of your measurements"] });
    const { type, value } = await this.canonical(scope, input);
    await this.db.tx.insert(measurements).values({
      workspaceId: scope.workspaceId,
      clientId: scope.clientId,
      typeId: type.id,
      value,
      measuredOn: input.measuredOn,
      source: "client",
      note: input.note || null,
      recordedByUserId: scope.userId,
    });
    return this.forClient();
  }

  /** Home tiles: shared metrics with a value, body weight first, at most two. */
  async sharedTiles(): Promise<SharedMetricTile[]> {
    const scope = this.client();
    const metrics = await this.metrics(scope, scope.clientId, "client");
    return metrics
      .filter((metric) => metric.latest !== null)
      .sort((a, b) => Number(b.type.key === "weight") - Number(a.type.key === "weight"))
      .slice(0, 2)
      .map((metric) => ({
        name: metric.type.name,
        unitKind: metric.type.unitKind,
        latest: metric.latest?.value ?? 0,
        change: metric.change,
        since: metric.change !== null ? (metric.first?.measuredOn ?? null) : null,
      }));
  }
}
