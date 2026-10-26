import { Injectable } from "@nestjs/common";
import { type ConvertLeadRequest, type ConvertLeadResponse, ERROR_CODES } from "@fitcoach/shared";
import { and, eq, inArray, ne, or, type SQL, sql } from "drizzle-orm";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { DomainError } from "../../common/errors/domain-error";
import { DbContext } from "../../db/db-context";
import { activityEvents, clients, leadFollowUps, leads, workspacePlans } from "../../db/schema";
import { PackagesService } from "../packages/packages.service";
import { trackEvent } from "../product-events/track";
import { type LeadRow, leadNotFound, LeadsService, type Trainer } from "./leads.service";

/** Clients that take a plan slot: active ones and the ones being onboarded. */
const COUNTED_STATUSES = ["active", "onboarding_draft"];

/**
 * Lead → client conversion (PROMPT §8.2), one transaction: lock the lead, link or create the client
 * (within the plan limit), sell the optional initial package, close open follow-ups, mark the lead
 * converted, record the history.
 * `clients(workspace_id, source_lead_id)` and the Idempotency-Key make concurrent clicks produce one
 * client; any failure rolls everything back, so a lead is never `converted` without its client.
 */
@Injectable()
export class LeadConversionService {
  constructor(
    private readonly db: DbContext,
    private readonly leads: LeadsService,
    private readonly idempotency: IdempotencyService,
    private readonly packages: PackagesService,
  ) {}

  convert(
    leadId: string,
    input: ConvertLeadRequest,
    idempotencyKey: string | undefined,
  ): Promise<ConvertLeadResponse> {
    return this.idempotency.run(`POST /v1/leads/${leadId}/convert`, idempotencyKey, input, () =>
      this.run(leadId, input),
    );
  }

  /**
   * FOR UPDATE applies the UPDATE policy, which hides converted leads; a lead that another request
   * just converted is therefore read again without a lock (it's final).
   */
  private async lockLead(trainer: Trainer, leadId: string): Promise<LeadRow> {
    const where = and(eq(leads.id, leadId), eq(leads.workspaceId, trainer.workspaceId));
    const [locked] = await this.db.tx.select().from(leads).where(where).for("update");
    if (locked) return locked;
    const [current] = await this.db.tx.select().from(leads).where(where);
    if (!current) throw leadNotFound();
    return current;
  }

  private next(lead: LeadRow, linked: boolean): string {
    return linked ? `/app/leads?lead=${lead.id}` : `/app/clients/new?fromLead=${lead.id}`;
  }

  private async run(leadId: string, input: ConvertLeadRequest): Promise<ConvertLeadResponse> {
    const trainer = this.leads.trainer();
    const lead = await this.lockLead(trainer, leadId);

    if (lead.stage === "converted" && lead.convertedClientId) {
      const [client] = await this.db.tx
        .select({ sourceLeadId: clients.sourceLeadId })
        .from(clients)
        .where(
          and(eq(clients.id, lead.convertedClientId), eq(clients.workspaceId, trainer.workspaceId)),
        );
      const linked = client?.sourceLeadId !== lead.id;
      return {
        clientId: lead.convertedClientId,
        linkedExisting: linked,
        next: this.next(lead, linked),
      };
    }
    if (lead.archivedAt) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Restore this lead first.");
    }

    const linked = input.linkClientId !== undefined;
    if (linked && input.initialPackage) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        initialPackage: ["Sell a package from their profile instead"],
      });
    }
    const clientId = linked
      ? await this.existingClient(trainer, input.linkClientId ?? "")
      : await this.createClient(trainer, lead, input);
    if (input.initialPackage) {
      // Same transaction (§8.2): the client and their package exist together, or neither does.
      await this.packages.sellInitial(
        trainer,
        clientId,
        input.initialPackage,
        input.coachingStartOn,
        "conversion",
      );
    }

    // Open follow-ups end with the lead; the client's own reminders come with their profile.
    const open = await this.db.tx
      .update(leadFollowUps)
      .set({ status: "skipped", completedAt: sql`now()`, completedByUserId: trainer.userId })
      .where(
        and(
          eq(leadFollowUps.workspaceId, trainer.workspaceId),
          eq(leadFollowUps.leadId, lead.id),
          eq(leadFollowUps.status, "open"),
        ),
      )
      .returning({ id: leadFollowUps.id, actionType: leadFollowUps.actionType });
    for (const followUp of open) {
      await this.leads.log(trainer, lead.id, "follow_up_skipped", {
        followUpId: followUp.id,
        actionType: followUp.actionType,
        reason: "converted",
      });
    }

    await this.db.tx
      .update(leads)
      .set({
        stage: "converted",
        lostReason: null,
        nurtureUntil: null,
        convertedClientId: clientId,
        convertedAt: sql`now()`,
        convertedByUserId: trainer.userId,
      })
      .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, trainer.workspaceId)));
    await this.leads.log(trainer, lead.id, "stage_changed", { from: lead.stage, to: "converted" });
    await this.leads.log(trainer, lead.id, "converted", { clientId, linked });
    await this.db.tx.insert(activityEvents).values({
      workspaceId: trainer.workspaceId,
      type: "lead_converted",
      leadId: lead.id,
      clientId,
      data: { linked },
      actorUserId: trainer.userId,
    });
    await trackEvent(this.db.tx, {
      event: "lead_converted",
      actorKind: "trainer",
      userId: trainer.userId,
      workspaceId: trainer.workspaceId,
      properties: { linked, source: lead.source },
    });

    return { clientId, linkedExisting: linked, next: this.next(lead, linked) };
  }

  private async existingClient(trainer: Trainer, clientId: string): Promise<string> {
    const [client] = await this.db.tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.workspaceId, trainer.workspaceId),
          ne(clients.status, "archived"),
        ),
      );
    if (!client) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        linkClientId: ["That client doesn't exist"],
      });
    }
    return client.id;
  }

  private async createClient(
    trainer: Trainer,
    lead: LeadRow,
    input: ConvertLeadRequest,
  ): Promise<string> {
    // A client with the same phone or email already exists: offer linking instead of failing on
    // the unique index (§8.2 step 2).
    const sameContact: SQL[] = [];
    if (lead.phoneE164) sameContact.push(eq(clients.phoneE164, lead.phoneE164));
    if (lead.email) sameContact.push(sql`${clients.email} = ${lead.email}`);
    const anyContact = or(...sameContact);
    if (anyContact) {
      const [match] = await this.db.tx
        .select({ id: clients.id, fullName: clients.fullName })
        .from(clients)
        .where(
          and(
            eq(clients.workspaceId, trainer.workspaceId),
            ne(clients.status, "archived"),
            anyContact,
          ),
        )
        .limit(1);
      if (match) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_DUPLICATE,
          409,
          `${match.fullName} is already a client with this phone or email. Link the lead to them instead.`,
          { linkClientId: [match.id] },
        );
      }
    }

    // The same lock as the activation trigger, so concurrent conversions can't both take the last
    // slot (§8.2 step 3, ADR-0033).
    await this.db.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`fitcoach:client-limit:${trainer.workspaceId}`}, 0))`,
    );
    const [plan] = await this.db.tx
      .select({ max: workspacePlans.maxActiveClients })
      .from(workspacePlans)
      .where(eq(workspacePlans.workspaceId, trainer.workspaceId));
    const [usage] = await this.db.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, trainer.workspaceId),
          inArray(clients.status, COUNTED_STATUSES),
        ),
      );
    if (plan && (usage?.count ?? 0) >= plan.max) {
      throw new DomainError(
        ERROR_CODES.PLAN_LIMIT,
        409,
        `Your plan allows ${plan.max} active clients. Archive a client you no longer coach, or contact us to raise the limit.`,
      );
    }

    const [client] = await this.db.tx
      .insert(clients)
      .values({
        workspaceId: trainer.workspaceId,
        sourceLeadId: lead.id,
        status: "onboarding_draft",
        fullName: lead.fullName,
        phoneE164: lead.phoneE164,
        email: lead.email,
        goal: lead.goal,
        trainingMode: lead.trainingMode,
        preferredSchedule: lead.preferredSchedule,
        location: lead.location,
        source: lead.source,
        campaign: lead.campaign,
        referrer: lead.referrer,
        utm: lead.utm,
        coachingStartOn: input.coachingStartOn ?? null,
        createdByUserId: trainer.userId,
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("client insert returned no row");
    return client.id;
  }
}
