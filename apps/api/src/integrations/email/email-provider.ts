export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  /** The provider's id for the message, when it returns one. */
  providerMessageId?: string;
}

/** Email boundary (PROMPT D13, §11): SMTP (Mailpit locally), Resend, or console (non-production). */
export interface EmailProvider {
  readonly name: "smtp" | "resend" | "brevo" | "console";
  send(message: EmailMessage, from: string): Promise<SendResult>;
}
