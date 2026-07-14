/**
 * Commerce Buy now webhook side-effect recovery on Stripe redelivery.
 *
 * insertCommerceOrder is idempotent on stripeSessionId and returns
 * alreadyRecorded on retry. Inquiry + client receipt are NOT ledger-writes —
 * an early-break on alreadyRecorded permanently skips them if the first
 * delivery crashed after the ledger. Recover each independently:
 * - inquiry: when no commerce_checkout inquiry mentions this stripeSessionId
 * - client receipt: when commerceOrders.clientReceiptEmailSentAt is unset
 *
 * Twin of planBundleWebhookSideEffects (per-email durable markers). See
 * /docs/process (commerce-client-receipt-redelivery-recovery).
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

/** True once the durable client-receipt sent-marker is set on the ledger row. */
export function hasCommerceClientReceiptSentMarker(
  order: { clientReceiptEmailSentAt?: string | null } | null | undefined,
): boolean {
  return Boolean(order?.clientReceiptEmailSentAt?.trim());
}

/**
 * Decide whether to fire operator inquiry and/or client receipt.
 * On redelivery (alreadyRecorded), still recover whichever side effect lacks
 * its durable marker. Inquiry and receipt stay independently recoverable
 * (matching bundle receipt/DNS) — inquiry presence alone must not permanently
 * skip a failed/suppressed client order-notification email.
 */
export function planCommerceWebhookSideEffects(input: {
  alreadyRecorded: boolean;
  inquiriesForLead: ReadonlyArray<{ source?: string; message: string }>;
  stripeSessionId: string;
  /** When true, skip the client receipt (durable marker already written). */
  clientReceiptAlreadySent?: boolean;
}): CommerceSideEffectPlan {
  const hasInquiry = hasCommerceCheckoutInquiryForSession(
    input.inquiriesForLead,
    input.stripeSessionId,
  );
  const runInquiry = !hasInquiry;
  const runClientReceipt = !input.clientReceiptAlreadySent;

  if (!runInquiry && !runClientReceipt) {
    return {
      runInquiry: false,
      runClientReceipt: false,
      reason: "already_notified",
    };
  }

  return {
    runInquiry,
    runClientReceipt,
    reason: input.alreadyRecorded ? "redelivery_recovery" : "first_delivery",
  };
}
