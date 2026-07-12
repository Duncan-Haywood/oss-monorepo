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

export function inquiryCanReceiveReply(inquiry: {
  email?: string | null;
  status: string;
}): boolean {
  if (inquiry.status === "archived") return false;
  return Boolean(inquiry.email && inquiry.email.trim().length > 0);
}
