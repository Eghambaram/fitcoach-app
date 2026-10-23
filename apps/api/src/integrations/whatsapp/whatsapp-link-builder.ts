import { Injectable } from "@nestjs/common";
import {
  buildWhatsAppUrl,
  firstName,
  type MessageTemplatePlaceholder,
  type MessageTemplatePurpose,
  renderTemplate,
  type WhatsAppLink,
} from "@fitcoach/shared";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { DbContext } from "../../db/db-context";
import { messageTemplates, profiles } from "../../db/schema";

export type MessageContext = {
  template: string;
  trainerName: string;
  purpose: MessageTemplatePurpose;
};

/**
 * WhatsApp click-to-chat (PROMPT §11, CLAUDE.md rule 20d). Renders the workspace's message template
 * with known placeholders and returns a `wa.me` link. Nothing is sent: the trainer presses Send in
 * WhatsApp, and the app logs a contact only after they confirm "Sent". The Business Platform API is
 * Later.
 */
@Injectable()
export class WhatsAppLinkBuilder {
  constructor(private readonly db: DbContext) {}

  /** The workspace's template for `purpose` (or the global default) and the trainer's name. */
  async context(
    workspaceId: string,
    userId: string,
    purpose: MessageTemplatePurpose,
  ): Promise<MessageContext> {
    const [template] = await this.db.tx
      .select({ body: messageTemplates.body })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.purpose, purpose),
          or(eq(messageTemplates.workspaceId, workspaceId), isNull(messageTemplates.workspaceId)),
        ),
      )
      // The workspace's own row wins over the global default.
      .orderBy(desc(sql`${messageTemplates.workspaceId} is not null`))
      .limit(1);
    const [profile] = await this.db.tx
      .select({ name: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return { template: template?.body ?? "", trainerName: profile?.name ?? "", purpose };
  }

  build(
    context: MessageContext,
    recipient: { fullName: string; phoneE164: string | null },
    values: Partial<Record<MessageTemplatePlaceholder, string>> = {},
  ): WhatsAppLink | null {
    if (!recipient.phoneE164) return null;
    const text = renderTemplate(context.template, {
      first_name: firstName(recipient.fullName),
      trainer_name: context.trainerName,
      ...values,
    });
    return { purpose: context.purpose, text, url: buildWhatsAppUrl(recipient.phoneE164, text) };
  }
}
