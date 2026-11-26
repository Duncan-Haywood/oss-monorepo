export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Provider-side dedupe key: a repeated send with the same key is not delivered twice. */
  idempotencyKey?: string;
  /**
   * Extra message headers, e.g. `List-Unsubscribe` / `List-Unsubscribe-Post` on marketing and
   * notification mail. Adapters only pass through names in SAFE_CUSTOM_HEADER_RE and strip CR/LF
   * from values; they never let this override From/To/Subject.
   */
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string /* base64 */; contentType: string }[];
  /**
   * "marketing" for newsletter welcome/nurture mail; everything else (verification, invitations,
   * submissions, reminders, digests, newsletter confirmation requests) is transactional, the
   * default. Cloudflare Email Service accepts transactional mail only, so the composition root
   * routes on this (context.ts, createEmailSender).
   */
  category?: "transactional" | "marketing";
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/** Custom header names an adapter may pass through (no From/To/Cc/Bcc/Subject/Reply-To overrides). */
export const SAFE_CUSTOM_HEADER_RE =
  /^(List-Unsubscribe|List-Unsubscribe-Post|List-Id|X-Entity-Ref-ID)$/i;

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

/** Attachment filename: no control characters, quotes or path separators. */
export function sanitizeFilename(s: string): string {
  const clean = sanitizeHeaderValue(s, 120).replace(/["'\\/:*?<>|]+/g, "_");
  return clean.replace(/^\.+/, "") || "attachment";
}

/** Allowlisted custom headers with single-line values; undefined when none remain. */
export function safeCustomHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!SAFE_CUSTOM_HEADER_RE.test(name)) continue;
    const clean = sanitizeHeaderValue(value);
    if (clean) out[name] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

export function assertAddresses(kind: string, addrs: string[]) {
  for (const a of addrs) {
    if (!isSafeEmailAddress(a)) throw new Error(`Email send failed: invalid ${kind} address`);
  }
}
