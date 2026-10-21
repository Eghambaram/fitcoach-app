import { Injectable } from "@nestjs/common";
import {
  type CheckInRules,
  type CoachingMode,
  type EnquiryFormFields,
  ERROR_CODES,
  enquiryFormFieldsSchema,
  type LocaleSettings,
  MESSAGE_TEMPLATE_PURPOSES,
  type MessageTemplatePurpose,
  type MessageTemplatesResponse,
  type PackagePolicy,
  type PackagePreset,
  type PackagePresetInput,
  type PackagePresetsResponse,
  type PublicPageSettingsRequest,
  type PublicPageSettingsResponse,
  type QrFormat,
  type WorkspaceSettingsResponse,
} from "@fitcoach/shared";
import { and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { toBuffer as qrToBuffer, toString as qrToString } from "qrcode";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { AppConfig } from "../../config/env";
import { DbContext } from "../../db/db-context";
import {
  files,
  leadForms,
  messageTemplates,
  packagePresets,
  profiles,
  subscriptionPlans,
  trainerPublicPages,
  trainerSettings,
  workspacePlans,
  workspaces,
} from "../../db/schema";
import { recordAudit } from "../audit/audit.service";
import { FilesService } from "../files/files.service";
import { trackEvent } from "../product-events/track";

type Trainer = AuthContext & { workspaceId: string };

/** Postgres SQLSTATE of a failed query; Drizzle wraps driver errors in `cause`. */
function pgCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: { code?: unknown } }).cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

const toIso = (value: Date | null) => (value ? value.toISOString() : null);

/**
 * Trainer settings (PROMPT §8.12). Every query runs in the request transaction as fitcoach_app, so
 * RLS limits it to the caller's workspace; queries still filter by workspace explicitly
 * (CLAUDE.md rule 3). Suspended workspaces are blocked from writes by WorkspaceGuard and RLS.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: AppConfig,
    private readonly files: FilesService,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private publicUrl(slug: string): string {
    return `${this.config.webOrigin}/coach/${slug}`;
  }

  // -------------------------------------------------------------------------------------------
  // Profile & public page
  // -------------------------------------------------------------------------------------------

  private async latestForm(workspaceId: string) {
    const [form] = await this.db.tx
      .select({
        version: leadForms.version,
        consentText: leadForms.consentText,
        fields: leadForms.fields,
      })
      .from(leadForms)
      .where(eq(leadForms.workspaceId, workspaceId))
      .orderBy(desc(leadForms.version))
      .limit(1);
    if (!form) throw new Error("workspace has no enquiry form");
    return { ...form, fields: enquiryFormFieldsSchema.parse(form.fields) };
  }

  async getPublicPage(): Promise<PublicPageSettingsResponse> {
    const trainer = this.trainer();
    const [row] = await this.db.tx
      .select({
        displayName: profiles.displayName,
        avatarKey: files.objectKey,
        businessName: workspaces.name,
        slug: workspaces.slug,
        coachingModes: workspaces.coachingModes,
        headline: trainerPublicPages.headline,
        bio: trainerPublicPages.bio,
        location: trainerPublicPages.location,
        coachingTypes: trainerPublicPages.coachingTypes,
        isPublished: trainerPublicPages.isPublished,
        publishedAt: trainerPublicPages.publishedAt,
      })
      .from(workspaces)
      .innerJoin(trainerPublicPages, eq(trainerPublicPages.workspaceId, workspaces.id))
      .innerJoin(profiles, eq(profiles.userId, trainer.userId))
      .leftJoin(files, eq(files.id, profiles.avatarFileId))
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.notFound();
    const form = await this.latestForm(trainer.workspaceId);

    return {
      displayName: row.displayName,
      businessName: row.businessName,
      slug: row.slug,
      headline: row.headline ?? "",
      bio: row.bio ?? "",
      location: row.location ?? "",
      coachingTypes: row.coachingTypes,
      coachingModes: row.coachingModes as CoachingMode[],
      avatarUrl: this.files.avatarUrl(row.avatarKey),
      form: { ...form.fields, consentText: form.consentText, version: form.version },
      isPublished: row.isPublished,
      publishedAt: toIso(row.publishedAt),
      publicUrl: this.publicUrl(row.slug),
    };
  }

  async updatePublicPage(input: PublicPageSettingsRequest): Promise<PublicPageSettingsResponse> {
    const trainer = this.trainer();
    const tx = this.db.tx;

    await tx
      .update(profiles)
      .set({ displayName: input.displayName })
      .where(eq(profiles.userId, trainer.userId));
    try {
      await tx
        .update(workspaces)
        .set({ name: input.businessName, slug: input.slug, coachingModes: input.coachingModes })
        .where(eq(workspaces.id, trainer.workspaceId));
    } catch (error) {
      // Other workspaces' slugs are invisible under RLS, so the unique index is the check.
      if (pgCode(error) === "23505") {
        throw new DomainError(ERROR_CODES.CONFLICT_DUPLICATE, 409, "That page address is taken.", {
          slug: ["This address is already taken. Try another one."],
        });
      }
      throw error;
    }
    await tx
      .update(trainerPublicPages)
      .set({
        headline: input.headline || null,
        bio: input.bio || null,
        location: input.location || null,
        coachingTypes: input.coachingTypes,
      })
      .where(eq(trainerPublicPages.workspaceId, trainer.workspaceId));

    // The form is versioned: a change in wording or fields is a new version, never an edit.
    const current = await this.latestForm(trainer.workspaceId);
    const fields: EnquiryFormFields = {
      email: input.form.email,
      schedule: input.form.schedule,
      message: input.form.message,
    };
    const changed =
      current.consentText !== input.form.consentText ||
      JSON.stringify(current.fields) !== JSON.stringify(fields);
    if (changed) {
      await tx.insert(leadForms).values({
        workspaceId: trainer.workspaceId,
        version: current.version + 1,
        consentText: input.form.consentText,
        fields,
        createdByUserId: trainer.userId,
      });
    }

    return this.getPublicPage();
  }

  async setPublished(published: boolean): Promise<PublicPageSettingsResponse> {
    const trainer = this.trainer();
    const page = await this.getPublicPage();
    if (published && !page.headline) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_FAILED,
        400,
        "Add a headline before publishing your page.",
        { headline: ["Add a headline before publishing your page."] },
      );
    }
    if (page.isPublished === published) return page;

    await this.db.tx
      .update(trainerPublicPages)
      .set({ isPublished: published, publishedAt: published ? sql`now()` : null })
      .where(eq(trainerPublicPages.workspaceId, trainer.workspaceId));
    if (published) {
      await trackEvent(this.db.tx, {
        event: "public_page_published",
        actorKind: "trainer",
        userId: trainer.userId,
        workspaceId: trainer.workspaceId,
        properties: { coachingTypes: page.coachingTypes.length, hasPhoto: page.avatarUrl !== null },
      });
    }
    await recordAudit(this.db.tx, {
      actorKind: "trainer",
      actorUserId: trainer.userId,
      workspaceId: trainer.workspaceId,
      action: published ? "public_page.published" : "public_page.unpublished",
      targetType: "workspace",
      targetId: trainer.workspaceId,
    });
    return this.getPublicPage();
  }

  /** QR code for the page link, tagged `?src=qr` so scans show up as their own lead source. */
  async qrCode(format: QrFormat): Promise<{ data: Buffer; slug: string }> {
    const trainer = this.trainer();
    const [row] = await this.db.tx
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.notFound();
    const target = `${this.publicUrl(row.slug)}?src=qr`;
    const options = { margin: 2, errorCorrectionLevel: "M" as const };
    const data =
      format === "png"
        ? await qrToBuffer(target, { ...options, type: "png", width: 1024 })
        : Buffer.from(await qrToString(target, { ...options, type: "svg" }), "utf8");
    return { data, slug: row.slug };
  }

  // -------------------------------------------------------------------------------------------
  // Units & locale, check-in & attention rules, package policy, plan
  // -------------------------------------------------------------------------------------------

  async getWorkspaceSettings(): Promise<WorkspaceSettingsResponse> {
    const trainer = this.trainer();
    const [row] = await this.db.tx
      .select({
        settings: trainerSettings,
        timezone: workspaces.timezone,
        country: workspaces.country,
        planName: subscriptionPlans.name,
        maxActiveClients: workspacePlans.maxActiveClients,
        trialEndsAt: workspacePlans.trialEndsAt,
      })
      .from(workspaces)
      .innerJoin(trainerSettings, eq(trainerSettings.workspaceId, workspaces.id))
      .innerJoin(workspacePlans, eq(workspacePlans.workspaceId, workspaces.id))
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, workspacePlans.planId))
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.notFound();
    const s = row.settings;

    return {
      locale: {
        weightUnit: s.weightUnit as LocaleSettings["weightUnit"],
        lengthUnit: s.lengthUnit as LocaleSettings["lengthUnit"],
        timezone: row.timezone,
        country: row.country,
      },
      checkIns: {
        checkInFrequency: s.checkInFrequency as CheckInRules["checkInFrequency"],
        noCheckInDays: s.noCheckInDays,
        noMeasurementDays: s.noMeasurementDays,
      },
      packagePolicy: {
        noShowUsesSession: s.noShowUsesSession,
        lateCancelWindowHours: s.lateCancelWindowHours,
        lateCancelUsesSession: s.lateCancelUsesSession,
        lowSessionsThreshold: s.lowSessionsThreshold,
        expiryWarningDays: s.expiryWarningDays,
      },
      plan: {
        planName: row.planName,
        maxActiveClients: row.maxActiveClients,
        trialEndsAt: toIso(row.trialEndsAt),
      },
    };
  }

  async updateLocale(input: LocaleSettings): Promise<WorkspaceSettingsResponse> {
    const trainer = this.trainer();
    await this.db.tx
      .update(trainerSettings)
      .set({ weightUnit: input.weightUnit, lengthUnit: input.lengthUnit })
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    await this.db.tx
      .update(workspaces)
      .set({ timezone: input.timezone, country: input.country })
      .where(eq(workspaces.id, trainer.workspaceId));
    return this.getWorkspaceSettings();
  }

  async updateCheckIns(input: CheckInRules): Promise<WorkspaceSettingsResponse> {
    const trainer = this.trainer();
    await this.db.tx
      .update(trainerSettings)
      .set(input)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    return this.getWorkspaceSettings();
  }

  async updatePackagePolicy(input: PackagePolicy): Promise<WorkspaceSettingsResponse> {
    const trainer = this.trainer();
    await this.db.tx
      .update(trainerSettings)
      .set(input)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    return this.getWorkspaceSettings();
  }

  // -------------------------------------------------------------------------------------------
  // Message templates (one per purpose; global rows are the read-only defaults)
  // -------------------------------------------------------------------------------------------

  async listTemplates(): Promise<MessageTemplatesResponse> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select({
        workspaceId: messageTemplates.workspaceId,
        purpose: messageTemplates.purpose,
        body: messageTemplates.body,
      })
      .from(messageTemplates)
      .where(
        sql`${messageTemplates.workspaceId} is null or ${messageTemplates.workspaceId} = ${trainer.workspaceId}`,
      );
    const defaults = new Map(
      rows.filter((r) => r.workspaceId === null).map((r) => [r.purpose, r.body]),
    );
    const own = new Map(rows.filter((r) => r.workspaceId !== null).map((r) => [r.purpose, r.body]));

    return {
      templates: MESSAGE_TEMPLATE_PURPOSES.map((purpose) => {
        const defaultBody = defaults.get(purpose) ?? "";
        const body = own.get(purpose) ?? defaultBody;
        return { purpose, body, defaultBody, isCustomised: body !== defaultBody };
      }),
    };
  }

  async updateTemplate(
    purpose: MessageTemplatePurpose,
    body: string,
  ): Promise<MessageTemplatesResponse> {
    const trainer = this.trainer();
    await this.db.tx
      .insert(messageTemplates)
      .values({ workspaceId: trainer.workspaceId, purpose, body })
      .onConflictDoUpdate({
        target: [messageTemplates.workspaceId, messageTemplates.purpose],
        set: { body },
      });
    return this.listTemplates();
  }

  async resetTemplate(purpose: MessageTemplatePurpose): Promise<MessageTemplatesResponse> {
    const [fallback] = await this.db.tx
      .select({ body: messageTemplates.body })
      .from(messageTemplates)
      .where(and(isNull(messageTemplates.workspaceId), eq(messageTemplates.purpose, purpose)));
    if (!fallback) throw DomainError.notFound();
    return this.updateTemplate(purpose, fallback.body);
  }

  // -------------------------------------------------------------------------------------------
  // Package presets (§8.3A). Archive instead of delete; money in paise.
  // -------------------------------------------------------------------------------------------

  async listPresets(): Promise<PackagePresetsResponse> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select()
      .from(packagePresets)
      .where(eq(packagePresets.workspaceId, trainer.workspaceId))
      .orderBy(asc(packagePresets.sortOrder), asc(packagePresets.createdAt));
    return {
      presets: rows.map((row): PackagePreset => ({
        id: row.id,
        name: row.name,
        kind: row.kind as PackagePreset["kind"],
        sessionsIncluded: row.sessionsIncluded,
        durationDays: row.durationDays,
        sessionsPerWeek: row.sessionsPerWeek,
        defaultPricePaise: row.defaultPricePaise === null ? null : Number(row.defaultPricePaise),
        archived: row.archivedAt !== null,
      })),
    };
  }

  private presetValues(input: PackagePresetInput) {
    return {
      name: input.name,
      kind: input.kind,
      sessionsIncluded: input.sessionsIncluded,
      durationDays: input.durationDays,
      sessionsPerWeek: input.sessionsPerWeek,
      defaultPricePaise: input.defaultPricePaise === null ? null : BigInt(input.defaultPricePaise),
    };
  }

  async createPreset(input: PackagePresetInput): Promise<PackagePresetsResponse> {
    const trainer = this.trainer();
    const [last] = await this.db.tx
      .select({ sortOrder: max(packagePresets.sortOrder) })
      .from(packagePresets)
      .where(eq(packagePresets.workspaceId, trainer.workspaceId));
    await this.db.tx.insert(packagePresets).values({
      workspaceId: trainer.workspaceId,
      ...this.presetValues(input),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    });
    return this.listPresets();
  }

  /** Another workspace's (or a global) preset id matches nothing here → 404, never an edit. */
  private async updatePresetRow(id: string, set: Partial<typeof packagePresets.$inferInsert>) {
    const trainer = this.trainer();
    const updated = await this.db.tx
      .update(packagePresets)
      .set(set)
      .where(and(eq(packagePresets.id, id), eq(packagePresets.workspaceId, trainer.workspaceId)))
      .returning({ id: packagePresets.id });
    if (updated.length === 0) throw DomainError.notFound("That package preset doesn't exist.");
    return this.listPresets();
  }

  updatePreset(id: string, input: PackagePresetInput): Promise<PackagePresetsResponse> {
    return this.updatePresetRow(id, this.presetValues(input));
  }

  setPresetArchived(id: string, archived: boolean): Promise<PackagePresetsResponse> {
    return this.updatePresetRow(id, { archivedAt: archived ? new Date() : null });
  }
}
