/**
 * Operator reply-from-dashboard for clientInquiries — pure helpers so validation
 * stays unit-testable (see /docs/process inquiry-dashboard-reply).
 */

/** Soft cap so a single reply cannot bloat SQLite/Convex documents or email size. */
export const MAX_INQUIRY_REPLY_LENGTH = 4000;

/**
 * Normalize operator reply body for send + persistence: trim, reject empty /
 * over-long input (caller should show the error).
 */
export function normalizeInquiryReply(
  raw: string | undefined | null,
): { ok: true; body: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, error: "Reply body is required" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Reply body is required" };
  }
  if (trimmed.length > MAX_INQUIRY_REPLY_LENGTH) {
    return {
      ok: false,
      error: `Reply must be ${MAX_INQUIRY_REPLY_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, body: trimmed };
}

/** Escape text for safe inclusion in HTML email bodies. */
export function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convert plain-text reply/message into HTML paragraphs (escaped). */
export function plainTextToEmailHtml(text: string): string {
  return escapeHtmlForEmail(text)
    .split(/\n{2,}/)
    .map((block) => {
      const withBreaks = block.replace(/\n/g, "<br />");
      return `<p style="margin: 0 0 12px 0;">${withBreaks}</p>`;
    })
    .join("");
}

/**
 * Convert a composed HTML email body into a readable plain-text
 * alternative — the rough inverse of plainTextToEmailHtml. Every outbound
 * email template here builds HTML only; providers (Resend included) treat a
 * missing text part as a spam-score signal and it's the only body some mail
 * clients render, so every send should carry one instead of hand-maintaining
 * a second copy of each template. Not a general HTML-to-text library — only
 * needs to handle the tags this repo's own templates emit (p/div/h1-6/li/tr,
 * br/hr, a[href], plus the five entities escapeHtmlForEmail produces).
 */
export function plainTextFromEmailHtml(html: string): string {
  const withLinks = html.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, text: string) => `${text} (${href})`,
  );
  const withBreaks = withLinks
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return decoded
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function inquiryCanReceiveReply(inquiry: {
  email?: string | null;
  status: string;
}): boolean {
  if (inquiry.status === "archived") return false;
  return Boolean(inquiry.email && inquiry.email.trim().length > 0);
}

/**
 * Opening the reply composer on a brand-new inquiry should silently mark it
 * read — it distinguishes "seen, drafting a reply" from "nobody has looked
 * at this yet" in the unreplied-inquiry pipeline metric without a separate
 * click. Only fires on the "new" -> composer-open transition, never on close.
 */
export function inquiryShouldAutoMarkRead(
  inquiry: { status: string },
  isOpeningComposer: boolean,
): boolean {
  return isOpeningComposer && inquiry.status === "new";
}
