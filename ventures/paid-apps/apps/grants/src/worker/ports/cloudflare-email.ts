// Email adapter for Cloudflare Email Service (Email Sending, public beta since 2026-04-16), through
// the Worker's `send_email` binding `EMAIL` (wrangler.jsonc). Chosen 2026-11-24 to consolidate on
// Cloudflare; docs/EMAIL.md has the comparison with Resend and its sources.
//
// Transactional mail only. Cloudflare's FAQ: "Can I use Email Service for marketing emails? No. Email
// Service supports transactional email only." So a message with category "marketing" is refused
// here, and context.ts routes marketing mail to a provider that allows it.
//
// The same header safety as the Resend adapter: one bare address per recipient, single-line header
// values, only allowlisted custom headers (List-Unsubscribe / -Post / List-Id / X-Entity-Ref-ID are
// all accepted by Cloudflare's header allowlist).
//
// Differences from Resend that callers should know:
// - No provider-side idempotency key. Every caller already claims a DB row before sending
//   (submission row, marketing_email_log, attachment nonce), so `idempotencyKey` was the second
//   guard, not the first; it is dropped here.
// - Errors carry a `code` (E_SENDER_DOMAIN_NOT_AVAILABLE, E_RECIPIENT_SUPPRESSED, ...); the
//   message we throw keeps it so logs and `submission.error` say what went wrong.
import {
  assertAddresses,
  type EmailMessage,
  type EmailSender,
  isSafeEmailAddress,
  safeCustomHeaders,
  sanitizeFilename,
  sanitizeHeaderValue,
} from "./email";

/** The part of the `send_email` binding this adapter uses (structural, so tests can pass a fake). */
export interface EmailSendBinding {
  send(builder: EmailMessageBuilder): Promise<{ messageId: string }>;
}

/**
 * `EMAIL_FROM` ("Grant Autopilot <no-reply@example.org>" or a bare address) as the binding's
 * `from`. Throws on anything that is not one safe address, so a bad config fails loudly.
 */
export function parseFromAddress(from: string): string | EmailAddress {
  const m = /^\s*"?([^"<>]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
  const email = (m?.[2] ?? from).trim();
  if (!email || !isSafeEmailAddress(email)) {
    throw new Error("Email send failed: EMAIL_FROM is not a valid sender address");
  }
  const name = m ? sanitizeHeaderValue(m[1] ?? "", 120) : "";
  return name ? { email, name } : email;
}

export class CloudflareEmailSender implements EmailSender {
  constructor(
    private binding: EmailSendBinding,
    private from: string,
  ) {}

  async send(msg: EmailMessage) {
    if (msg.category === "marketing") {
      throw new Error(
        "Email send failed: Cloudflare Email Service accepts transactional mail only (marketing refused)",
      );
    }
    if (msg.to.length === 0) throw new Error("Email send failed: no recipients");
    if (msg.to.length > 50) throw new Error("Email send failed: too many recipients");
    assertAddresses("recipient", msg.to);
    if (msg.replyTo !== undefined) assertAddresses("reply-to", [msg.replyTo]);

    const headers = safeCustomHeaders(msg.headers);
    const builder: EmailMessageBuilder = {
      from: parseFromAddress(this.from),
      to: msg.to,
      subject: sanitizeHeaderValue(msg.subject),
      text: msg.text,
      ...(msg.html !== undefined ? { html: msg.html } : {}),
      ...(msg.replyTo !== undefined ? { replyTo: msg.replyTo } : {}),
      ...(headers ? { headers } : {}),
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) => ({
              disposition: "attachment" as const,
              filename: sanitizeFilename(a.filename),
              type: sanitizeHeaderValue(a.contentType, 200),
              content: a.content,
            })),
          }
        : {}),
    };

    let res: { messageId: string };
    try {
      res = await this.binding.send(builder);
    } catch (e) {
      const err = e as { code?: unknown; message?: unknown };
      const code = typeof err.code === "string" ? err.code : "";
      const detail = typeof err.message === "string" ? err.message.slice(0, 200) : "";
      throw new Error(
        `Email send failed: ${[code, detail].filter(Boolean).join(" ") || "unknown"}`,
      );
    }
    return { id: res.messageId };
  }
}

/** Routes by `category`: marketing mail to one sender, everything else to another. */
export class CategoryRoutedEmailSender implements EmailSender {
  constructor(
    private transactional: EmailSender,
    private marketing: EmailSender,
  ) {}

  send(msg: EmailMessage) {
    return (msg.category === "marketing" ? this.marketing : this.transactional).send(msg);
  }
}

/**
 * Stands in for a marketing provider when none is configured. Throws, so the newsletter sequence
 * releases its claim and retries later instead of recording mail as sent that never went out.
 */
export class NoMarketingProviderSender implements EmailSender {
  async send(_msg: EmailMessage): Promise<{ id: string }> {
    throw new Error(
      "Email send failed: no marketing email provider configured (Cloudflare Email Service is transactional only; see docs/EMAIL.md)",
    );
  }
}
