import { createTransport, type Transporter } from "nodemailer";
import type { SystemDb } from "../../db/system-db";
import { emailOutbox } from "../../db/schema";
import type { EmailMessage, EmailProvider, SendResult } from "./email-provider";

/** Any SMTP server — Mailpit locally (smtp://localhost:1025), a provider's SMTP relay elsewhere. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private readonly transport: Transporter;

  constructor(smtpUrl: string) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: EmailMessage, from: string): Promise<SendResult> {
    const info = await this.transport.sendMail({ from, ...message });
    return { providerMessageId: typeof info.messageId === "string" ? info.messageId : undefined };
  }
}

/** Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, from: string): Promise<SendResult> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Status only: the body can echo the recipient address.
      throw new Error(`Resend responded ${response.status}`);
    }
    const body = (await response.json()) as { id?: unknown };
    return { providerMessageId: typeof body.id === "string" ? body.id : undefined };
  }
}

/**
 * Brevo's HTTPS API (https://developers.brevo.com/reference/sendtransacemail). For hosts that block
 * outbound SMTP (Railway Hobby, ADR-0065): sends from a verified single sender, e.g. a Gmail
 * address, without owning a domain.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, from: string): Promise<SendResult> {
    const response = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseAddress(from),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Status only: the body can echo the recipient address.
      throw new Error(`Brevo responded ${response.status}`);
    }
    const body = (await response.json()) as { messageId?: unknown };
    return { providerMessageId: typeof body.messageId === "string" ? body.messageId : undefined };
  }
}

/** "FitCoach <noreply@example.com>" → { name, email }; a bare address has no name. */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = (match[1] ?? "").replace(/^"|"$/g, "").trim();
  return name ? { name, email: (match[2] ?? "").trim() } : { email: (match[2] ?? "").trim() };
}

/** Stores emails in `email_outbox` instead of sending. Refused in production by config validation. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  constructor(private readonly systemDb: SystemDb) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const [row] = await this.systemDb.run("email: console provider writes to email_outbox", (tx) =>
      tx
        .insert(emailOutbox)
        .values({
          toAddress: message.to,
          subject: message.subject,
          textBody: message.text,
          htmlBody: message.html,
        })
        .returning({ id: emailOutbox.id }),
    );
    return { providerMessageId: row?.id };
  }
}
