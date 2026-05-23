import type { ReactElement } from "react";
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { renderEmail } from "@/emails/render";

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  react?: ReactElement;
}

let cachedClient: Resend | undefined;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  let html = msg.html;
  let text = msg.text;
  if (msg.react) {
    const rendered = await renderEmail(msg.react);
    html = rendered.html;
    text = rendered.text;
  }
  if (!html || !text) {
    throw new Error("sendEmail requires either react or both html+text");
  }

  const client = getClient();
  if (!client) {
    logger().info({ to: msg.to, subject: msg.subject }, "email:dry-run (no RESEND_API_KEY set)");
    return;
  }
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  const result = await client.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html,
    text,
  });
  if (result.error) {
    logger().error({ err: result.error, to: msg.to }, "email:send-failed");
    throw new Error(`email send failed: ${result.error.message}`);
  }
  logger().info({ to: msg.to, id: result.data?.id }, "email:sent");
}
