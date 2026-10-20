import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { AppConfig } from "../../config/env";
import { notificationDeliveries } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import type { EmailMessage, EmailProvider } from "./email-provider";
import { ConsoleEmailProvider, ResendEmailProvider, SmtpEmailProvider } from "./providers";

export interface EmailContext {
  /** Template name for the delivery log, e.g. "auth.verify_email". */
  template: string;
  userId?: string | null;
  workspaceId?: string | null;
}

/**
 * Sends email through the configured provider and records every attempt in notification_deliveries
 * (PROMPT §8.10). Never throws to callers: auth flows must answer the same way whether or not the
 * email went out. Never logs addresses or bodies (CLAUDE.md rule 13).
 * A pg-boss queue with retries replaces the direct send in step 5.2.
 */
@Injectable()
export class EmailService {
  private readonly provider: EmailProvider;

  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailService.name);
    const { provider, smtpUrl, resendApiKey } = config.email;
    if (provider === "smtp" && smtpUrl) this.provider = new SmtpEmailProvider(smtpUrl);
    else if (provider === "resend" && resendApiKey)
      this.provider = new ResendEmailProvider(resendApiKey);
    else this.provider = new ConsoleEmailProvider(systemDb);
  }

  async send(message: EmailMessage, context: EmailContext): Promise<boolean> {
    let status: "sent" | "failed" = "sent";
    let providerMessageId: string | undefined;
    let error: string | undefined;
    try {
      ({ providerMessageId } = await this.provider.send(message, this.config.email.from));
    } catch (failure) {
      status = "failed";
      error = failure instanceof Error ? failure.message.slice(0, 500) : "unknown error";
      this.logger.warn(
        { template: context.template, provider: this.provider.name, error },
        "email send failed",
      );
    }

    try {
      await this.systemDb.run("email: record delivery attempt", (tx) =>
        tx.insert(notificationDeliveries).values({
          channel: "email",
          template: context.template,
          userId: context.userId ?? null,
          workspaceId: context.workspaceId ?? null,
          provider: this.provider.name,
          providerMessageId,
          status,
          error,
        }),
      );
    } catch (failure) {
      this.logger.error(
        { err: failure, template: context.template },
        "could not record email delivery",
      );
    }
    return status === "sent";
  }

  /** Fire-and-forget for auth flows, so response timing doesn't reveal whether an email was sent. */
  sendInBackground(message: EmailMessage, context: EmailContext): void {
    void this.send(message, context);
  }
}
