import { Injectable } from "@nestjs/common";
import {
  type CoachingMode,
  type EnquiryFormFields,
  type EnquiryRequest,
  ERROR_CODES,
  enquiryFormFieldsSchema,
  FITNESS_GOAL_LABELS,
  LEAD_SOURCE_LABELS,
  normalizePhone,
  type PublicPageResponse,
} from "@fitcoach/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { DomainError } from "../../common/errors/domain-error";
import { RateLimitService } from "../../common/security/rate-limit.service";
import type { RequestMeta } from "../../common/security/request-meta";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import {
  files,
  leadActivities,
  leadConsents,
  leadForms,
  leads,
  notifications,
  profiles,
  trainerPublicPages,
  workspaces,
} from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { verifyTurnstile } from "../../integrations/turnstile/turnstile";
import { recordAudit } from "../audit/audit.service";
import { FilesService } from "../files/files.service";
import { trackEvent } from "../product-events/track";
import { checkFormToken, issueFormToken } from "./form-token";

const MINUTE = 60;
/** A suspended, pending or cancelled workspace's page is offline (it can't take new leads). */
const LIVE_WORKSPACE_STATUSES = ["trialing", "active", "past_due"];

const pageUnavailable = () => DomainError.notFound("This page isn't available.");

interface LivePage {
  workspaceId: string;
  ownerUserId: string;
  slug: string;
  businessName: string;
  country: string;
  coachingModes: string[];
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  coachingTypes: string[];
  avatarKey: string | null;
}

interface CurrentForm {
  id: string;
  version: number;
  consentText: string;
  fields: EnquiryFormFields;
}

/**
 * The public enquiry page (PROMPT §8.2). Anonymous visitors have no session, so both the read model
 * and the enquiry write run through SystemDb, in a narrow service that exposes only whitelisted
 * fields of published pages and only inserts lead + consent + activity + notification
 * (CLAUDE.md rule 4).
 */
@Injectable()
export class PublicPageService {
  constructor(
    private readonly systemDb: SystemDb,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfig,
    private readonly files: FilesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PublicPageService.name);
  }

  private async livePage(tx: Tx, slug: string): Promise<LivePage | undefined> {
    const [page] = await tx
      .select({
        workspaceId: workspaces.id,
        ownerUserId: workspaces.ownerUserId,
        slug: workspaces.slug,
        businessName: workspaces.name,
        country: workspaces.country,
        coachingModes: workspaces.coachingModes,
        displayName: profiles.displayName,
        headline: trainerPublicPages.headline,
        bio: trainerPublicPages.bio,
        location: trainerPublicPages.location,
        coachingTypes: trainerPublicPages.coachingTypes,
        avatarKey: files.objectKey,
      })
      .from(workspaces)
      .innerJoin(trainerPublicPages, eq(trainerPublicPages.workspaceId, workspaces.id))
      .innerJoin(profiles, eq(profiles.userId, workspaces.ownerUserId))
      .leftJoin(files, eq(files.id, profiles.avatarFileId))
      .where(
        and(
          eq(workspaces.slug, slug),
          eq(trainerPublicPages.isPublished, true),
          inArray(workspaces.status, LIVE_WORKSPACE_STATUSES),
        ),
      );
    return page;
  }

  private async currentForm(tx: Tx, workspaceId: string): Promise<CurrentForm | undefined> {
    const [form] = await tx
      .select({
        id: leadForms.id,
        version: leadForms.version,
        consentText: leadForms.consentText,
        fields: leadForms.fields,
      })
      .from(leadForms)
      .where(eq(leadForms.workspaceId, workspaceId))
      .orderBy(desc(leadForms.version))
      .limit(1);
    return form ? { ...form, fields: enquiryFormFieldsSchema.parse(form.fields) } : undefined;
  }

  async getPublishedPage(slug: string, meta: RequestMeta): Promise<PublicPageResponse> {
    await this.rateLimit.consume({
      key: `public-page:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: MINUTE,
      max: 120,
    });
    const found = await this.systemDb.run("public page: read a published page", async (tx) => {
      const page = await this.livePage(tx, slug);
      const form = page ? await this.currentForm(tx, page.workspaceId) : undefined;
      return page && form ? { page, form } : undefined;
    });
    if (!found) throw pageUnavailable();
    const { page, form } = found;

    return {
      slug: page.slug,
      displayName: page.displayName,
      businessName: page.businessName,
      headline: page.headline,
      bio: page.bio,
      location: page.location,
      coachingTypes: page.coachingTypes,
      coachingModes: page.coachingModes as CoachingMode[],
      avatarUrl: this.files.avatarUrl(page.avatarKey),
      form: { version: form.version, consentText: form.consentText, fields: form.fields },
      formToken: issueFormToken(this.config.sessionSecret, page.workspaceId),
    };
  }

  /**
   * Stores an enquiry. Bot signals (honeypot filled, sent faster than a person could type) get the
   * same `{ ok: true }` as a real enquiry but store nothing, so bots learn nothing.
   */
  async submitEnquiry(input: EnquiryRequest, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume({
      key: `enquiry:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 10 * MINUTE,
      max: 5,
    });
    if (input.website) {
      this.logger.info({ reason: "honeypot" }, "enquiry dropped as spam");
      return;
    }
    if (this.config.turnstileSecretKey) {
      const passed =
        input.turnstileToken !== undefined &&
        (await verifyTurnstile(this.config.turnstileSecretKey, input.turnstileToken));
      if (!passed) {
        throw new DomainError(
          ERROR_CODES.VALIDATION_FAILED,
          400,
          "Please complete the check and try again.",
          { turnstileToken: ["Please complete the check and try again."] },
        );
      }
    }

    // Workspace-level limit: one trainer's page can't be used to flood their lead list.
    const target = await this.systemDb.run("public enquiry: find the published page", (tx) =>
      this.livePage(tx, input.slug),
    );
    if (!target) throw pageUnavailable();
    await this.rateLimit.consume({
      key: `enquiry:workspace:${target.workspaceId}`,
      windowSeconds: 60 * MINUTE,
      max: 30,
    });

    const tokenCheck = checkFormToken(
      this.config.sessionSecret,
      target.workspaceId,
      input.formToken,
    );
    if (tokenCheck === "too_fast") {
      this.logger.info({ reason: "too_fast" }, "enquiry dropped as spam");
      return;
    }
    if (tokenCheck !== "ok") throw formOutdated();

    await this.systemDb.run(
      "public enquiry: insert lead, consent, activity and notification",
      async (tx) => {
        // Re-read inside the write transaction: the page may have been unpublished meanwhile.
        const page = await this.livePage(tx, input.slug);
        const form = page ? await this.currentForm(tx, page.workspaceId) : undefined;
        if (!page || !form || page.workspaceId !== target.workspaceId) throw pageUnavailable();
        if (form.version !== input.consentVersion) throw formOutdated();

        const values = applyFormRules(input, form.fields, page);
        const [lead] = await tx
          .insert(leads)
          .values({ workspaceId: page.workspaceId, ...values, createdVia: "public_page" })
          .returning({ id: leads.id });
        if (!lead) throw new Error("lead insert returned no row");

        await tx.insert(leadConsents).values({
          workspaceId: page.workspaceId,
          leadId: lead.id,
          leadFormId: form.id,
          ipHash: meta.ipHash,
          userAgent: meta.userAgent,
        });
        await tx.insert(leadActivities).values({
          workspaceId: page.workspaceId,
          leadId: lead.id,
          type: "enquiry_received",
          data: { source: values.source, formVersion: form.version },
          actorKind: "system",
        });
        await tx.insert(notifications).values({
          workspaceId: page.workspaceId,
          recipientUserId: page.ownerUserId,
          type: "new_lead",
          title: `New enquiry from ${values.fullName}`,
          body: `${FITNESS_GOAL_LABELS[input.goal]} · via ${LEAD_SOURCE_LABELS[values.source]}`,
          link: `/app/leads/${lead.id}`,
          data: { leadId: lead.id },
        });
        await trackEvent(tx, {
          event: "lead_captured",
          actorKind: "system",
          userId: null,
          workspaceId: page.workspaceId,
          properties: { source: values.source, hasEmail: values.email !== null },
        });
        await recordAudit(tx, {
          actorKind: "system",
          actorUserId: null,
          workspaceId: page.workspaceId,
          action: "lead.enquiry_received",
          targetType: "lead",
          targetId: lead.id,
          after: { source: values.source, formVersion: form.version },
          ipHash: meta.ipHash,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
      },
    );
  }
}

function formOutdated(): DomainError {
  return new DomainError(
    ERROR_CODES.FORM_OUTDATED,
    409,
    "This form has changed since you opened it. Reload the page and try again.",
  );
}

/** Applies the trainer's form settings: required/hidden email, hidden optional fields, offered modes. */
function applyFormRules(
  input: EnquiryRequest,
  fields: EnquiryFormFields,
  page: LivePage,
): {
  fullName: string;
  phoneE164: string;
  email: string | null;
  goal: string;
  trainingMode: string | null;
  preferredSchedule: string | null;
  message: string | null;
  source: EnquiryRequest["source"];
  campaign: string | null;
  utm: Record<string, string>;
} {
  const email = fields.email === "hidden" ? null : input.email || null;
  if (fields.email === "required" && !email) {
    throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
      email: ["Enter your email address"],
    });
  }
  const phoneE164 = normalizePhone(input.phone, page.country);
  if (!phoneE164) {
    throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
      phone: ["Enter a valid phone number"],
    });
  }
  const modes = page.coachingModes;
  const trainingMode =
    modes.length === 1
      ? (modes[0] ?? null)
      : input.preferredMode && modes.includes(input.preferredMode)
        ? input.preferredMode
        : null;
  const utm = Object.fromEntries(
    Object.entries(input.utm ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    ),
  );

  return {
    fullName: input.fullName,
    phoneE164,
    email,
    goal: input.goal,
    trainingMode,
    preferredSchedule: fields.schedule ? input.preferredSchedule || null : null,
    message: fields.message ? input.message || null : null,
    source: input.source,
    campaign: utm.campaign ?? null,
    utm,
  };
}
