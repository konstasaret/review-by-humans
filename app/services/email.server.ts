import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
type EmailMessage = { id: string; to: string; subject: string; text: string };

export function createEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER || "development";
  if (provider === "resend") return new ResendEmailSender();
  if (provider !== "development") throw new Error("Unsupported EMAIL_PROVIDER");
  if (process.env.NODE_ENV === "production")
    throw new Error("Configure EMAIL_PROVIDER=resend for real email delivery");
  return new DevelopmentEmailSender();
}

export class ResendEmailSender implements EmailSender {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(message: EmailMessage) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from)
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
    // Never email a localhost invitation that the recipient cannot open.
    const origin = new URL(process.env.SHOPIFY_APP_URL || "");
    if (
      origin.protocol !== "https:" ||
      origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]"
    )
      throw new Error("Real email requires a public HTTPS SHOPIFY_APP_URL");
    z.email().parse(message.to);
    if (/[\r\n]/.test(from)) throw new Error("Invalid EMAIL_FROM");
    const response = await this.request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-invitation/${message.id}`,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    // Do not include provider bodies: they may contain customer data or secrets.
    if (!response.ok)
      throw new Error(`Email provider rejected request (${response.status})`);
    const result = await response.json();
    if (typeof result?.id !== "string" || !result.id)
      throw new Error("Email provider did not acknowledge the message");
  }
}
export interface EmailSender {
  send(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void>;
}
export class DevelopmentEmailSender implements EmailSender {
  async send(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
  }) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Development email sender is forbidden in production. Configure EMAIL_PROVIDER=resend.",
      );
    const directory = path.resolve(process.env.DEV_OUTBOX_DIR || "work/outbox");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(directory, `${message.id}.json`),
      JSON.stringify({ developmentOnly: true, ...message }, null, 2),
      { mode: 0o600 },
    );
  }
}

export async function removeDevelopmentMessages(ids: string[]) {
  if (process.env.NODE_ENV === "production") return;
  const directory = path.resolve(process.env.DEV_OUTBOX_DIR || "work/outbox");
  for (const id of ids) {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error("Invalid invitation ID");
    try {
      await unlink(path.join(directory, `${id}.json`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
