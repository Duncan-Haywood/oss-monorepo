/**
 * Bounds for operator-submitted client inquiry ids on dashboard actions.
 *
 * Auth-gated actions still need finite client-input ceilings —
 * requireOperatorAuth is not a payload-size throttle. Soft-cap/truncate would
 * change the opaque app-owned `inq_*` lookup key (genuine ids are
 * `inq_${leadSlug}_${Date.now().toString(36)}_${random6}` — ≤ ~92 chars with
 * MAX_LEAD_SLUG_LENGTH=63).
 *
 * Hard-reject over MAX before any Convex/SQLite / Resend work
 * (replyToInquiryAction + updateInquiryStatusAction).
 */

export const MAX_INQUIRY_ID_LENGTH = 128;

/**
 * New id for a client inquiry (contact form / commerce_checkout webhook
 * side effect). Mirrors newCommerceOrderId / newCommerceSkuId's
 * timestamp+random pattern — millisecond-only Date.now() collides when two
 * inquiries for the same lead are created in the same millisecond (a
 * double-submit/retry, or two near-simultaneous commerce_checkout webhook
 * inquiries), and Convex's by_inquiryId `.unique()` lookups (getById,
 * updateStatus, recordReply) throw on a duplicate id rather than silently
 * picking one, permanently orphaning both rows (inquiry-id-collision-guard).
 */
export function newClientInquiryId(leadSlug: string): string {
  return `inq_${leadSlug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ParseInquiryIdResult =
  | { ok: true; inquiryId: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim and validate a dashboard inquiry id.
 * Empty/whitespace → missing; over MAX → too_long (never truncate).
 */
export function parseInquiryId(raw: unknown): ParseInquiryIdResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "missing" };
  }
  const inquiryId = raw.trim();
  if (!inquiryId) {
    return { ok: false, reason: "missing" };
  }
  if (inquiryId.length > MAX_INQUIRY_ID_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, inquiryId };
}
