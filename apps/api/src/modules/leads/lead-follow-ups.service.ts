import { Injectable } from "@nestjs/common";
import {
  type CompleteFollowUpRequest,
  type ContactChannel,
  type ContactOutcome,
  ERROR_CODES,
  FOLLOW_UP_ACTION_CHANNEL,
  type FollowUpAction,
  type FollowUpRequest,
  type LeadDetailResponse,
  type LogContactRequest,
  type MessageTemplatePurpose,
} from "@fitcoach/shared";
import { and, eq, sql } from "drizzle-orm";
import { DomainError } from "../../common/errors/domain-error";
import { DbContext } from "../../db/db-context";
import { communicationLogs, leadFollowUps, leads } from "../../db/schema";
import { type LeadRow, LeadsService, type Trainer } from "./leads.service";

/** How far ahead a follow-up may be scheduled. */
const MAX_DAYS_AHEAD = 366;

const followUpNotFound = () => DomainError.notFound("That follow-up doesn't exist.");

/**
 * Follow-ups and the communication log (PROMPT §8.2, §8.10). Runs in the request transaction as
 * fitcoach_app, so completing a follow-up, logging the contact and scheduling the next one commit
 * together or not at all. Triggers keep `leads.next_follow_up_at` and `last_contact_at` in step.
 */
@Injectable()
export class LeadFollowUpsService {
  constructor(
    private readonly db: DbContext,
    private readonly leads: LeadsService,
  ) {}

  /** Follow-ups and contacts are for leads still in the pipeline. */
  private async activeLead(trainer: Trainer, leadId: string): Promise<LeadRow> {
    const lead = await this.leads.findLead(trainer, leadId);
    if (lead.stage === "converted") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This lead is already a client. Follow up from their client profile.",
      );
    }
    if (lead.archivedAt) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Restore this lead first.");
    }
    return lead;
  }

  /** The picked local date and time, read in the workspace time zone (CLAUDE.md rule 19). */
  private async dueAt(trainer: Trainer, input: FollowUpRequest, path = ""): Promise<Date> {
    const { timezone } = await this.leads.workspace(trainer);
    const result = await this.db.tx.execute<{
      due_at: Date | string;
      past: boolean;
      too_far: boolean;
    }>(
      sql`select
        ((${input.dueDate}::date + ${input.dueTime}::time) at time zone ${timezone}) as due_at,
        ${input.dueDate}::date < (now() at time zone ${timezone})::date as past,
        ${input.dueDate}::date > (now() at time zone ${timezone})::date + ${MAX_DAYS_AHEAD}::int as too_far`,
    );
    const row = result.rows[0];
    const field = `${path}dueDate`;
    if (!row || row.past) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        [field]: ["Choose today or a later date"],
      });
    }
    if (row.too_far) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        [field]: ["Choose a date within the next year"],
      });
    }
    return new Date(row.due_at);
  }

  private async insertFollowUp(
    trainer: Trainer,
    leadId: string,
    input: FollowUpRequest,
    path = "",
  ): Promise<void> {
    const dueAt = await this.dueAt(trainer, input, path);
    const [created] = await this.db.tx
      .insert(leadFollowUps)
      .values({
        workspaceId: trainer.workspaceId,
        leadId,
        actionType: input.actionType,
        dueAt,
        notes: input.notes || null,
        reminder: input.reminder,
        createdByUserId: trainer.userId,
      })
      .returning({ id: leadFollowUps.id });
    if (!created) throw new Error("follow-up insert returned no row");
    await this.leads.log(trainer, leadId, "follow_up_scheduled", {
      followUpId: created.id,
      actionType: input.actionType,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
    });
  }

  /**
   * Locks an open follow-up so a double-submitted "Done" can't finish it twice. FOR UPDATE applies
   * the UPDATE policy, which hides finished rows, so those are read without a lock (they're final).
   */
  private async lockFollowUp(trainer: Trainer, leadId: string, followUpId: string) {
    const where = and(
      eq(leadFollowUps.workspaceId, trainer.workspaceId),
      eq(leadFollowUps.leadId, leadId),
      eq(leadFollowUps.id, followUpId),
    );
    const [locked] = await this.db.tx.select().from(leadFollowUps).where(where).for("update");
    if (locked) return locked;
    const [finished] = await this.db.tx.select().from(leadFollowUps).where(where);
    if (!finished) throw followUpNotFound();
    return finished;
  }

  /** Writes the contact; a lead that was still "new" has now been contacted. */
  private async insertContact(
    trainer: Trainer,
    lead: LeadRow,
    contact: {
      channel: ContactChannel;
      outcome: ContactOutcome;
      note?: string | null;
      templatePurpose?: MessageTemplatePurpose;
      followUpId?: string;
    },
  ): Promise<void> {
    await this.db.tx.insert(communicationLogs).values({
      workspaceId: trainer.workspaceId,
      leadId: lead.id,
      followUpId: contact.followUpId ?? null,
      channel: contact.channel,
      outcome: contact.outcome,
      note: contact.note || null,
      templatePurpose: contact.templatePurpose ?? null,
      actorUserId: trainer.userId,
    });
    if (lead.stage === "new") {
      await this.db.tx
        .update(leads)
        .set({ stage: "contacted" })
        .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, trainer.workspaceId)));
      await this.leads.log(trainer, lead.id, "stage_changed", {
        from: "new",
        to: "contacted",
        automatic: true,
      });
    }
  }

  async schedule(leadId: string, input: FollowUpRequest): Promise<LeadDetailResponse> {
    const trainer = this.leads.trainer();
    await this.activeLead(trainer, leadId);
    await this.insertFollowUp(trainer, leadId, input);
    return this.leads.get(leadId);
  }

  async reschedule(
    leadId: string,
    followUpId: string,
    input: FollowUpRequest,
  ): Promise<LeadDetailResponse> {
    const trainer = this.leads.trainer();
    await this.activeLead(trainer, leadId);
    const before = await this.lockFollowUp(trainer, leadId, followUpId);
    if (before.status !== "open") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This follow-up is already finished, so it can't change.",
      );
    }
    const dueAt = await this.dueAt(trainer, input);
    await this.db.tx
      .update(leadFollowUps)
      .set({
        actionType: input.actionType,
        dueAt,
        notes: input.notes || null,
        reminder: input.reminder,
      })
      .where(
        and(eq(leadFollowUps.id, followUpId), eq(leadFollowUps.workspaceId, trainer.workspaceId)),
      );
    if (before.dueAt.getTime() !== dueAt.getTime()) {
      await this.leads.log(trainer, leadId, "follow_up_rescheduled", {
        followUpId,
        actionType: input.actionType,
        dueDate: input.dueDate,
        dueTime: input.dueTime,
      });
    }
    return this.leads.get(leadId);
  }

  async complete(
    leadId: string,
    followUpId: string,
    input: CompleteFollowUpRequest,
  ): Promise<LeadDetailResponse> {
    const trainer = this.leads.trainer();
    const lead = await this.activeLead(trainer, leadId);
    const followUp = await this.lockFollowUp(trainer, leadId, followUpId);
    if (followUp.status !== "open") {
      // A repeated submit of the same answer is a no-op; a different answer is a conflict.
      if (followUp.status === input.status) return this.leads.get(leadId);
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "This follow-up is already finished.");
    }

    const done = input.status === "done";
    await this.db.tx
      .update(leadFollowUps)
      .set({
        status: input.status,
        outcome: input.outcome ?? null,
        outcomeNote: input.outcomeNote || null,
        completedAt: sql`now()`,
        completedByUserId: trainer.userId,
      })
      .where(
        and(eq(leadFollowUps.id, followUpId), eq(leadFollowUps.workspaceId, trainer.workspaceId)),
      );
    await this.leads.log(trainer, leadId, done ? "follow_up_completed" : "follow_up_skipped", {
      followUpId,
      actionType: followUp.actionType,
      ...(input.outcome ? { outcome: input.outcome } : {}),
    });

    const channel = FOLLOW_UP_ACTION_CHANNEL[followUp.actionType as FollowUpAction];
    if (done && input.logContact && channel && input.outcome) {
      await this.insertContact(trainer, lead, {
        channel,
        outcome: input.outcome,
        note: input.outcomeNote,
        templatePurpose: input.templatePurpose,
        followUpId,
      });
    }
    if (input.next) await this.insertFollowUp(trainer, leadId, input.next, "next.");
    return this.leads.get(leadId);
  }

  async logContact(leadId: string, input: LogContactRequest): Promise<LeadDetailResponse> {
    const trainer = this.leads.trainer();
    const lead = await this.activeLead(trainer, leadId);
    await this.insertContact(trainer, lead, input);
    return this.leads.get(leadId);
  }
}
