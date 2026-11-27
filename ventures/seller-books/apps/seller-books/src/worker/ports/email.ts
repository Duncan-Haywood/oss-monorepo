// Email port: account mail (verify address, reset password, "you already have an account").
// Pattern and header-safety rules from apps/grants (ports/email.ts, ports/cloudflare-email.ts).
//
// Providers (createEmailSender):
// - Cloudflare Email Service through the Worker's `send_email` binding `EMAIL` (wrangler.jsonc),
//   when EMAIL_FROM is set. Transactional mail only, which is all Seller Books sends.
// - FakeEmailSender in tests and the offline demo (FAKE_EXTERNALS=true): kept in memory.
// - LogEmailSender otherwise: logs that a message was not sent (recipient count and subject only).
import type { Env } from "../env";
import type { Logger } from "../lib/logger";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Extra headers, only the names in ALLOWED_HEADERS (List-Unsubscribe for the weekly email). */
  headers?: Record<string, string>;
}

/** The only extra headers a message may carry; anything else is refused. */
export const ALLOWED_HEADERS = new Set(["List-Unsubscribe", "List-Unsubscribe-Post"]);

/** Checks names against ALLOWED_HEADERS and puts each value on one line. */
export function safeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_HEADERS.has(name))
      throw new Error(`Email send failed: header ${name} not allowed`);
    out[name] = sanitizeHeaderValue(value, 2000);
  }
  return out;
}

export interface EmailSender {
  /** True when mail actually leaves the Worker (a fake or log sender is false). */
  readonly delivers: boolean;
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/** One bare address: no whitespace, quotes, commas, semicolons, angle brackets or parentheses. */
const STRICT_EMAIL_RE =
  /^[^\s@"'<>(),;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export const isSafeEmailAddress = (s: string): boolean =>
  s.length <= 254 && STRICT_EMAIL_RE.test(s);

/** A header value on one line: control characters (incl. CR/LF) become spaces; RFC 5322 length cap. */
export function sanitizeHeaderValue(s: string, max = 900): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const control = code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
    out += control ? " " : ch;
  }
  return out.replace(/ {2,}/g, " ").trim().slice(0, max);
}

export function assertAddresses(kind: string, addrs: string[]) {
  for (const a of addrs) {
    if (!isSafeEmailAddress(a)) throw new Error(`Email send failed: invalid ${kind} address`);
  }
}

/** The part of the `send_email` binding this adapter uses (structural, so tests can pass a fake). */
export interface EmailSendBinding {
  send(message: {
    from: string | { email: string; name: string };
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

/**
 * `EMAIL_FROM` ("Seller Books <no-reply@example.org>" or a bare address) as the binding's `from`.
 * Throws on anything that is not one safe address, so a bad config fails loudly.
 */
export function parseFromAddress(from: string): string | { email: string; name: string } {
  const m = /^\s*"?([^"<>]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
  const email = (m?.[2] ?? from).trim();
  if (!email || !isSafeEmailAddress(email)) {
    throw new Error("Email send failed: EMAIL_FROM is not a valid sender address");
  }
  const name = m ? sanitizeHeaderValue(m[1] ?? "", 120) : "";
  return name ? { email, name } : email;
}

export class CloudflareEmailSender implements EmailSender {
  readonly delivers = true;
  constructor(
    private binding: EmailSendBinding,
    private from: string,
  ) {}

  async send(msg: EmailMessage) {
    if (msg.to.length === 0) throw new Error("Email send failed: no recipients");
    if (msg.to.length > 50) throw new Error("Email send failed: too many recipients");
    assertAddresses("recipient", msg.to);
    if (msg.replyTo !== undefined) assertAddresses("reply-to", [msg.replyTo]);
    const headers = msg.headers !== undefined ? safeHeaders(msg.headers) : undefined;
    let res: { messageId: string };
    try {
      res = await this.binding.send({
        from: parseFromAddress(this.from),
        to: msg.to,
        subject: sanitizeHeaderValue(msg.subject),
        text: msg.text,
        ...(msg.html !== undefined ? { html: msg.html } : {}),
        ...(msg.replyTo !== undefined ? { replyTo: msg.replyTo } : {}),
        ...(headers !== undefined ? { headers } : {}),
      });
    } catch (e) {
      // Cloudflare errors carry a `code` (E_SENDER_DOMAIN_NOT_AVAILABLE, E_RECIPIENT_SUPPRESSED, ...).
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

/** Keeps every message in memory: tests read `sent`; the offline demo shows nothing is sent. */
export class FakeEmailSender implements EmailSender {
  readonly delivers = false;
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    return { id: `fake-email-${this.sent.length}` };
  }
}

/** No provider configured: log that nothing was sent (no addresses, links or tokens). */
export class LogEmailSender implements EmailSender {
  readonly delivers = false;
  constructor(private logger?: Logger) {}
  async send(msg: EmailMessage) {
    const data = { to: msg.to.length, subject: sanitizeHeaderValue(msg.subject) };
    if (this.logger) this.logger.warn("email.not_sent_no_provider", data);
    else
      console.warn(JSON.stringify({ level: "warn", msg: "email.not_sent_no_provider", ...data }));
    return { id: "logged" };
  }
}

export function createEmailSender(
  env: Pick<Env, "EMAIL_FROM"> & { EMAIL?: EmailSendBinding },
  logger?: Logger,
): EmailSender {
  const from = env.EMAIL_FROM?.trim();
  if (env.EMAIL && from) return new CloudflareEmailSender(env.EMAIL, from);
  return new LogEmailSender(logger);
}
