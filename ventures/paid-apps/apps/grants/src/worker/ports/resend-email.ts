// Email adapter (OWNER: submission agent). Resend HTTP API; logs-only when no key is configured.
// Since 2026-11-24 the default transactional sender is Cloudflare Email Service (cloudflare-email.ts);
// Resend stays for marketing mail, which Cloudflare does not accept, and as a fallback (context.ts).
//
// Header safety: subjects carry user-entered org names and opportunity titles scraped from public
// sites, and recipients come from imported funder data. Every header value is stripped of CR/LF and
// other control characters, and every address must be a single bare address (no display name,
// comma or angle brackets) so one field can never smuggle extra headers or recipients.
import {
  assertAddresses,
  type EmailMessage,
  type EmailSender,
  safeCustomHeaders,
  sanitizeFilename,
  sanitizeHeaderValue,
} from "./email";

// The helpers moved to ./email (shared with the Cloudflare adapter); re-exported for older imports.
export {
  isSafeEmailAddress,
  safeCustomHeaders,
  sanitizeFilename,
  sanitizeHeaderValue,
} from "./email";

export class ResendEmailSender implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async send(msg: EmailMessage) {
    if (msg.to.length === 0) throw new Error("Email send failed: no recipients");
    if (msg.to.length > 50) throw new Error("Email send failed: too many recipients");
    assertAddresses("recipient", msg.to);
    if (msg.replyTo !== undefined) assertAddresses("reply-to", [msg.replyTo]);
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey
          ? { "Idempotency-Key": sanitizeHeaderValue(msg.idempotencyKey, 256) }
          : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: msg.to,
        subject: sanitizeHeaderValue(msg.subject),
        text: msg.text,
        html: msg.html,
        reply_to: msg.replyTo,
        headers: safeCustomHeaders(msg.headers),
        attachments: msg.attachments?.map((a) => ({
          filename: sanitizeFilename(a.filename),
          content: a.content,
          content_type: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      // Resend error bodies are { name, message } — safe to surface (no secrets), truncated.
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string; name?: string };
        detail = [body.name, body.message].filter(Boolean).join(": ").slice(0, 200);
      } catch {
        // non-JSON error body
      }
      throw new Error(`Email send failed: ${res.status}${detail ? ` ${detail}` : ""}`);
    }
    const body = (await res.json()) as { id: string };
    return { id: body.id };
  }
}

export class LogEmailSender implements EmailSender {
  async send(msg: EmailMessage) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "email.not_sent_no_provider",
        to: msg.to.length,
        subject: sanitizeHeaderValue(msg.subject),
        attachments: msg.attachments?.length ?? 0,
      }),
    );
    return { id: "logged" };
  }
}
