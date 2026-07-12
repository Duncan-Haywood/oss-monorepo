/**
 * Commerce Buy now webhook side-effect recovery on Stripe redelivery.
 *
 * insertCommerceOrder is idempotent on stripeSessionId and returns
 * alreadyRecorded on retry. Inquiry + client receipt are NOT ledger-writes —
 * an early-break on alreadyRecorded permanently skips them if the first
 * delivery crashed after the ledger. Recover when no commerce_checkout
 * inquiry mentions this stripeSessionId; skip when one already exists.
 *
 * See /docs/process (commerce-webhook-side-effect-recovery-on-redelivery).
 */

export type CommerceSideEffectReason =
  | "first_delivery"
  | "redelivery_recovery"
  | "already_notified";

export type CommerceSideEffectPlan = {
  runInquiry: boolean;
  runClientReceipt: boolean;
  reason: CommerceSideEffectReason;
};

/** True when an inquiry message embeds this Stripe Checkout Session id. */
export function inquiryMentionsStripeSession(
  message: string,
  stripeSessionId: string,
): boolean {
  if (!stripeSessionId) return false;
  return message.includes(stripeSessionId);
}

/**
 * Find a prior commerce_checkout inquiry for this session (idempotency key
 * lives in the message body produced by commerceOrderPaidInquiryMessage).
 */
export function hasCommerceCheckoutInquiryForSession(
  inquiries: ReadonlyArray<{ source?: string; message: string }>,
  stripeSessionId: string,
): boolean {
  return inquiries.some(
    (inq) =>
      inq.source === "commerce_checkout" &&
      inquiryMentionsStripeSession(inq.message, stripeSessionId),
  );
}

/**
 * Decide whether to fire operator inquiry + client receipt.
 * On redelivery (alreadyRecorded), still recover when the inquiry is missing.
 * The webhook must return 5xx on inquiry write failure so Stripe actually
 * redelivers into this path — ACK 200 after a swallowed inquiry error makes
 * recovery unreachable. When an inquiry already exists, skip both — receipt-only
 * failure after a successful inquiry stays best-effort (operator has the inbox row).
 */
export function planCommerceWebhookSideEffects(input: {
  alreadyRecorded: boolean;
  inquiriesForLead: ReadonlyArray<{ source?: string; message: string }>;
  stripeSessionId: string;
}): CommerceSideEffectPlan {
  const hasInquiry = hasCommerceCheckoutInquiryForSession(
    input.inquiriesForLead,
    input.stripeSessionId,
  );
  if (hasInquiry) {
    return {
      runInquiry: false,
      runClientReceipt: false,
      reason: "already_notified",
    };
  }
  return {
    runInquiry: true,
    runClientReceipt: true,
    reason: input.alreadyRecorded ? "redelivery_recovery" : "first_delivery",
  };
}
