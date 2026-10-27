import { Injectable } from "@nestjs/common";
import {
  BASELINE_MEASUREMENTS,
  type BaselineMeasurement,
  CONSENT_NOTICES,
  type CreateOnboardingDraftRequest,
  ERROR_CODES,
  type FinalizeOnboardingRequest,
  type FinalizeOnboardingResponse,
  type LengthUnit,
  MEASUREMENT_KINDS,
  MEASUREMENT_LABELS,
  MEASUREMENT_RANGES,
  type MeasurementUnits,
  normalizePhone,
  type OnboardingDraft,
  type OnboardingDraftData,
  onboardingDraftDataSchema,
  type OnboardingDraftsResponse,
  type OnboardingFromLeadResponse,
  round2,
  type SaveOnboardingDraftRequest,
  toCm,
  toKg,
  type WeightUnit,
} from "@fitcoach/shared";
import { and, desc, eq, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  activityEvents,
  clientConsents,
  clientGoals,
  clientOnboardingDrafts,
  clients,
  leads,
  measurements,
  measurementTypes,
  trainerSettings,
  workspaces,
} from "../../db/schema";
import { PackagesService } from "../packages/packages.service";
import { trackEvent } from "../product-events/track";

type Trainer = AuthContext & { workspaceId: string };
type DraftRow = typeof clientOnboardingDrafts.$inferSelect;
type ClientRow = typeof clients.$inferSelect;

const draftNotFound = () => DomainError.notFound("That draft doesn't exist.");
const invalid = (fieldErrors: Record<string, string[]>) =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", fieldErrors);

/** Draft data written by an older wizard may not parse any more; keep whatever still does. */
function readDraftData(value: unknown): OnboardingDraftData {
  const parsed = onboardingDraftDataSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** A client created by lead conversion, as the wizard's starting point (§8.4 `?fromLead=`). */
function prefillFromClient(client: ClientRow): OnboardingDraftData {
  const data: OnboardingDraftData = {
    fullName: client.fullName,
    phone: client.phoneE164 ?? undefined,
    email: client.email ?? undefined,
    primaryGoal: (client.goal ?? undefined) as OnboardingDraftData["primaryGoal"],
    trainingMode: (client.trainingMode ?? undefined) as OnboardingDraftData["trainingMode"],
    location: client.location ?? undefined,
    preferredSchedule: client.preferredSchedule ?? undefined,
    coachingStartOn: client.coachingStartOn ?? undefined,
  };
  return readDraftData(Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)));
}

/**
 * Add Client onboarding (PROMPT §8.4). Drafts save any subset of the answers; finalize validates
 * everything and, in one transaction, creates or activates the client with goals, consents (notice
 * version + text) and baseline measurements (canonical units, append-only).
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly idempotency: IdempotencyService,
    private readonly packages: PackagesService,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private async units(trainer: Trainer): Promise<MeasurementUnits> {
    const [row] = await this.db.tx
      .select({ weightUnit: trainerSettings.weightUnit, lengthUnit: trainerSettings.lengthUnit })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    return {
      weightUnit: (row?.weightUnit ?? "kg") as WeightUnit,
      lengthUnit: (row?.lengthUnit ?? "cm") as LengthUnit,
    };
  }

  private async toDraft(trainer: Trainer, row: DraftRow): Promise<OnboardingDraft> {
    return {
      id: row.id,
      clientId: row.clientId,
      step: row.step,
      data: readDraftData(row.data),
      updatedAt: row.updatedAt.toISOString(),
      units: await this.units(trainer),
    };
  }

  private async findDraft(trainer: Trainer, id: string): Promise<DraftRow> {
    const [row] = await this.db.tx
      .select()
      .from(clientOnboardingDrafts)
      .where(
        and(
          eq(clientOnboardingDrafts.id, id),
          eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
        ),
      );
    if (!row) throw draftNotFound();
    return row;
  }

  private async onboardingClient(trainer: Trainer, clientId: string): Promise<ClientRow> {
    const [client] = await this.db.tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
    if (!client) throw invalid({ clientId: ["That client doesn't exist"] });
    if (client.status !== "onboarding_draft") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        `${client.fullName} has already been onboarded.`,
      );
    }
    return client;
  }

  // -------------------------------------------------------------------------------------------
  // Drafts
  // -------------------------------------------------------------------------------------------

  async listDrafts(): Promise<OnboardingDraftsResponse> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select()
      .from(clientOnboardingDrafts)
      .where(
        and(
          eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
          isNull(clientOnboardingDrafts.finalizedAt),
        ),
      )
      .orderBy(desc(clientOnboardingDrafts.updatedAt))
      .limit(50);
    return {
      drafts: rows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        fullName: readDraftData(row.data).fullName?.trim() || null,
        step: row.step,
        updatedAt: row.updatedAt.toISOString(),
      })),
      units: await this.units(trainer),
    };
  }

  async getDraft(id: string): Promise<OnboardingDraft> {
    const trainer = this.trainer();
    const row = await this.findDraft(trainer, id);
    if (row.finalizedAt) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This client has already been created.",
      );
    }
    return this.toDraft(trainer, row);
  }

  async fromLead(leadId: string): Promise<OnboardingFromLeadResponse> {
    const trainer = this.trainer();
    const [lead] = await this.db.tx
      .select({ stage: leads.stage, clientId: leads.convertedClientId })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, trainer.workspaceId)));
    if (!lead) throw DomainError.notFound("That lead doesn't exist.");
    if (lead.stage !== "converted" || !lead.clientId) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "Convert this lead to a client first.",
      );
    }
    const [client] = await this.db.tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, lead.clientId), eq(clients.workspaceId, trainer.workspaceId)));
    if (!client) throw DomainError.notFound();
    if (client.status !== "onboarding_draft") {
      return { status: "onboarded", clientId: client.id, fullName: client.fullName, draft: null };
    }
    const [open] = await this.db.tx
      .select()
      .from(clientOnboardingDrafts)
      .where(
        and(
          eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
          eq(clientOnboardingDrafts.clientId, client.id),
          isNull(clientOnboardingDrafts.finalizedAt),
        ),
      );
    const base = { status: "onboarding" as const, clientId: client.id, fullName: client.fullName };
    if (open) return { ...base, draft: await this.toDraft(trainer, open) };
    return {
      ...base,
      draft: {
        id: null,
        clientId: client.id,
        step: 1,
        data: prefillFromClient(client),
        updatedAt: null,
        units: await this.units(trainer),
      },
    };
  }

  async createDraft(input: CreateOnboardingDraftRequest): Promise<OnboardingDraft> {
    const trainer = this.trainer();
    if (input.clientId) {
      await this.onboardingClient(trainer, input.clientId);
      // One open draft per client: saving again from a second tab continues the same draft.
      const [open] = await this.db.tx
        .select()
        .from(clientOnboardingDrafts)
        .where(
          and(
            eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
            eq(clientOnboardingDrafts.clientId, input.clientId),
            isNull(clientOnboardingDrafts.finalizedAt),
          ),
        );
      if (open) return this.saveDraft(open.id, input);
    }
    const [row] = await this.db.tx
      .insert(clientOnboardingDrafts)
      .values({
        workspaceId: trainer.workspaceId,
        clientId: input.clientId ?? null,
        step: input.step,
        data: input.data,
        createdByUserId: trainer.userId,
      })
      .returning();
    if (!row) throw new Error("draft insert returned no row");
    return this.toDraft(trainer, row);
  }

  async saveDraft(id: string, input: SaveOnboardingDraftRequest): Promise<OnboardingDraft> {
    const trainer = this.trainer();
    const existing = await this.findDraft(trainer, id);
    if (existing.finalizedAt) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This client has already been created.",
      );
    }
    const [row] = await this.db.tx
      .update(clientOnboardingDrafts)
      .set({ step: input.step, data: input.data })
      .where(
        and(
          eq(clientOnboardingDrafts.id, id),
          eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
        ),
      )
      .returning();
    if (!row) throw draftNotFound();
    return this.toDraft(trainer, row);
  }

  // -------------------------------------------------------------------------------------------
  // Finalize
  // -------------------------------------------------------------------------------------------

  finalize(
    input: FinalizeOnboardingRequest,
    idempotencyKey: string | undefined,
  ): Promise<FinalizeOnboardingResponse> {
    return this.idempotency.run("POST /v1/onboarding/finalize", idempotencyKey, input, () =>
      this.runFinalize(input),
    );
  }

  /** Measurements in kg / cm / %, with plausibility checked in canonical units. */
  private canonicalMeasurements(input: FinalizeOnboardingRequest) {
    const values: { key: BaselineMeasurement; value: number }[] = [];
    const errors: Record<string, string[]> = {};
    for (const key of BASELINE_MEASUREMENTS) {
      const raw = input[key];
      if (raw === undefined) continue;
      const kind = MEASUREMENT_KINDS[key];
      const value =
        kind === "mass"
          ? toKg(raw, input.units.weightUnit)
          : kind === "length"
            ? toCm(raw, input.units.lengthUnit)
            : round2(raw);
      const [min, max] = MEASUREMENT_RANGES[key];
      if (value < min || value > max) {
        errors[key] = [`Check the ${MEASUREMENT_LABELS[key].toLowerCase()}: it looks out of range`];
      } else {
        values.push({ key, value });
      }
    }
    if (Object.keys(errors).length > 0) throw invalid(errors);
    return values;
  }

  private async runFinalize(input: FinalizeOnboardingRequest): Promise<FinalizeOnboardingResponse> {
    const trainer = this.trainer();
    const [workspace] = await this.db.tx
      .select({ country: workspaces.country, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!workspace) throw DomainError.forbidden();

    // The draft, locked; FOR UPDATE skips finished drafts (UPDATE policy), so read those plainly.
    let draft: DraftRow | undefined;
    if (input.draftId) {
      const where = and(
        eq(clientOnboardingDrafts.id, input.draftId),
        eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
      );
      [draft] = await this.db.tx.select().from(clientOnboardingDrafts).where(where).for("update");
      if (!draft) {
        const [finished] = await this.db.tx.select().from(clientOnboardingDrafts).where(where);
        if (!finished) throw draftNotFound();
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "This client has already been created.",
        );
      }
    }
    if (input.clientId && draft?.clientId && input.clientId !== draft.clientId) {
      throw invalid({ clientId: ["This draft belongs to a different client"] });
    }
    const clientId = input.clientId ?? draft?.clientId ?? undefined;

    // Contacts: E.164 with the workspace country (CLAUDE.md gotchas).
    const fieldErrors: Record<string, string[]> = {};
    const phoneE164 = input.phone ? normalizePhone(input.phone, workspace.country) : null;
    if (input.phone && !phoneE164) fieldErrors.phone = ["Enter a valid phone number"];
    const emergencyPhone = input.emergencyContactPhone
      ? normalizePhone(input.emergencyContactPhone, workspace.country)
      : null;
    if (input.emergencyContactPhone && !emergencyPhone) {
      fieldErrors.emergencyContactPhone = ["Enter a valid phone number"];
    }
    if (Object.keys(fieldErrors).length > 0) throw invalid(fieldErrors);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const baseline = this.canonicalMeasurements(input);

    // Another active client with the same phone or email: say who, instead of a bare 23505.
    const sameContact: SQL[] = [];
    if (phoneE164) sameContact.push(eq(clients.phoneE164, phoneE164));
    if (email) sameContact.push(sql`${clients.email} = ${email}`);
    const anyContact = or(...sameContact);
    if (anyContact) {
      const conditions: SQL[] = [
        eq(clients.workspaceId, trainer.workspaceId),
        ne(clients.status, "archived"),
        anyContact,
      ];
      if (clientId) conditions.push(ne(clients.id, clientId));
      const [match] = await this.db.tx
        .select({ fullName: clients.fullName })
        .from(clients)
        .where(and(...conditions))
        .limit(1);
      if (match) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_DUPLICATE,
          409,
          `${match.fullName} is already a client with this phone or email.`,
          { [phoneE164 ? "phone" : "email"]: ["Already used by another client"] },
        );
      }
    }

    const details = {
      fullName: input.fullName,
      phoneE164,
      email,
      goal: input.primaryGoal,
      trainingMode: input.trainingMode,
      preferredSchedule: input.preferredSchedule || null,
      location: input.location || null,
      dob: input.dob ?? null,
      coachingStartOn: input.coachingStartOn ?? null,
      emergencyContact: input.emergencyContactName
        ? {
            name: input.emergencyContactName,
            phone: emergencyPhone,
            relation: input.emergencyContactRelation || null,
          }
        : null,
      preferredContact: input.preferredContact ?? null,
      experienceLevel: input.experience ?? null,
      equipment: input.equipment || null,
      limitations: input.limitations || null,
      status: "active",
      onboardedAt: sql`now()`,
    };

    // Activation goes through the plan-limit trigger (FC001 → PLAN_LIMIT).
    let id: string;
    if (clientId) {
      const [locked] = await this.db.tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)))
        .for("update");
      if (!locked) throw invalid({ clientId: ["That client doesn't exist"] });
      await this.onboardingClient(trainer, clientId);
      await this.db.tx
        .update(clients)
        .set(details)
        .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
      id = clientId;
    } else {
      const [created] = await this.db.tx
        .insert(clients)
        .values({ ...details, workspaceId: trainer.workspaceId, createdByUserId: trainer.userId })
        .returning({ id: clients.id });
      if (!created) throw new Error("client insert returned no row");
      id = created.id;
    }

    const secondary = [...new Set(input.secondaryGoals)].filter(
      (goal) => goal !== input.primaryGoal,
    );
    await this.db.tx.insert(clientGoals).values([
      {
        workspaceId: trainer.workspaceId,
        clientId: id,
        kind: "primary",
        goal: input.primaryGoal,
        createdByUserId: trainer.userId,
      },
      ...secondary.map((goal) => ({
        workspaceId: trainer.workspaceId,
        clientId: id,
        kind: "secondary",
        goal,
        createdByUserId: trainer.userId,
      })),
    ]);

    await this.db.tx.insert(clientConsents).values(
      (
        [
          ["data_processing", true],
          ["progress_photos", input.consentProgressPhotos],
        ] as const
      ).map(([kind, granted]) => ({
        workspaceId: trainer.workspaceId,
        clientId: id,
        kind,
        status: granted ? "granted" : "declined",
        noticeVersion: CONSENT_NOTICES[kind].version,
        noticeText: CONSENT_NOTICES[kind].text,
        source: "onboarding",
        actorKind: "trainer",
        actorUserId: trainer.userId,
      })),
    );

    if (baseline.length > 0) {
      const types = await this.db.tx
        .select({ id: measurementTypes.id, key: measurementTypes.key })
        .from(measurementTypes)
        .where(isNull(measurementTypes.workspaceId));
      const typeIds = new Map(types.map((type) => [type.key, type.id]));
      const measuredOn =
        input.measuredOn ?? sql<string>`(now() at time zone ${workspace.timezone})::date`;
      await this.db.tx.insert(measurements).values(
        baseline.map(({ key, value }) => {
          const typeId = typeIds.get(key);
          if (!typeId) throw new Error(`measurement type ${key} is not seeded`);
          return {
            workspaceId: trainer.workspaceId,
            clientId: id,
            typeId,
            value,
            measuredOn: measuredOn as string,
            source: "trainer",
            recordedByUserId: trainer.userId,
          };
        }),
      );
    }

    // Finish this draft and any other open draft for the same client.
    const draftScope: SQL[] = [
      eq(clientOnboardingDrafts.workspaceId, trainer.workspaceId),
      isNull(clientOnboardingDrafts.finalizedAt),
    ];
    const which = or(
      ...(draft ? [eq(clientOnboardingDrafts.id, draft.id)] : []),
      eq(clientOnboardingDrafts.clientId, id),
    );
    if (which) draftScope.push(which);
    await this.db.tx
      .update(clientOnboardingDrafts)
      .set({ finalizedAt: sql`now()` })
      .where(and(...draftScope));

    if (input.initialPackage) {
      await this.packages.sellInitial(
        trainer,
        id,
        input.initialPackage,
        input.coachingStartOn,
        "onboarding",
      );
    }

    await this.db.tx.insert(activityEvents).values({
      workspaceId: trainer.workspaceId,
      type: "client_onboarded",
      clientId: id,
      data: { fromLead: clientId !== undefined, measurements: baseline.length },
      actorUserId: trainer.userId,
    });
    await trackEvent(this.db.tx, {
      event: "client_onboarded",
      actorKind: "trainer",
      userId: trainer.userId,
      workspaceId: trainer.workspaceId,
      properties: { fromLead: clientId !== undefined, measurements: baseline.length },
    });

    return {
      clientId: id,
      fullName: input.fullName,
      measurementsRecorded: baseline.length,
      hasPhone: phoneE164 !== null,
    };
  }
}
