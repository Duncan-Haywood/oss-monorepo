/**
 * Bundle (Starter/Growth/Complete) webhook side-effect recovery on Stripe
 * redelivery.
 *
 * recordLeadPayment + enqueueProductionHandoff are idempotent on
 * stripeSessionId. Buyer receipt + DNS handoff emails are NOT — an early
 * break on alreadyRecorded permanently skips them if the first delivery
 * crashed after durable fulfillment. Recover missing emails when deploy-handoff
 * notes lack a sent-marker embedding this stripeSessionId; skip when the
 * matching note already exists.
 *
 * Twin of planCommerceWebhookSideEffects (commerce Buy now inquiry/receipt).
 * See /docs/process (bundle-webhook-side-effect-recovery-on-redelivery).
 */

export type BundleSideEffectReason =
  | "first_delivery"
  | "redelivery_recovery"
  | "already_notified"
  | "no_customer_email";

export type BundleSideEffectPlan = {
  runReceiptEmail: boolean;
  runDnsHandoffEmail: boolean;
  reason: BundleSideEffectReason;
};

/** Stable note appended after a successful buyer receipt send. */
export function bundleReceiptEmailSentNote(stripeSessionId: string): string {
  return `Buyer receipt email sent — Stripe session ${stripeSessionId}`;
}

/** Stable note appended after a successful DNS / go-live handoff email send. */
export function bundleDnsHandoffEmailSentNote(stripeSessionId: string): string {
  return `DNS handoff email sent — Stripe session ${stripeSessionId}`;
}

/** True when a handoff note embeds this Stripe Checkout Session id. */
export function handoffNoteMentionsStripeSession(
  note: string,
  stripeSessionId: string,
): boolean {
  if (!stripeSessionId) return false;
  return note.includes(stripeSessionId);
}

export function hasBundleReceiptEmailNote(
  notes: ReadonlyArray<string>,
  stripeSessionId: string,
): boolean {
  const marker = bundleReceiptEmailSentNote(stripeSessionId);
  return notes.some(
    (note) =>
      note === marker ||
      (note.startsWith("Buyer receipt email sent —") &&
        handoffNoteMentionsStripeSession(note, stripeSessionId)),
  );
}

export function hasBundleDnsHandoffEmailNote(
  notes: ReadonlyArray<string>,
  stripeSessionId: string,
): boolean {
  const marker = bundleDnsHandoffEmailSentNote(stripeSessionId);
  return notes.some(
    (note) =>
      note === marker ||
      (note.startsWith("DNS handoff email sent —") &&
        handoffNoteMentionsStripeSession(note, stripeSessionId)),
  );
}

/**
 * Decide whether to fire buyer receipt and/or DNS handoff emails.
 * On redelivery (alreadyRecorded), still recover whichever email lacks a
 * durable handoff-note marker. Emails stay independently recoverable (same
 * pattern as commerce inquiry vs clientReceiptEmailSentAt).
 */
export function planBundleWebhookSideEffects(input: {
  alreadyRecorded: boolean;
  handoffNotes: ReadonlyArray<string>;
  stripeSessionId: string;
  hasCustomerEmail: boolean;
}): BundleSideEffectPlan {
  if (!input.hasCustomerEmail) {
    return {
      runReceiptEmail: false,
      runDnsHandoffEmail: false,
      reason: "no_customer_email",
    };
  }

  const hasReceipt = hasBundleReceiptEmailNote(
    input.handoffNotes,
    input.stripeSessionId,
  );
  const hasDns = hasBundleDnsHandoffEmailNote(
    input.handoffNotes,
    input.stripeSessionId,
  );

  if (hasReceipt && hasDns) {
    return {
      runReceiptEmail: false,
      runDnsHandoffEmail: false,
      reason: "already_notified",
    };
  }

  return {
    runReceiptEmail: !hasReceipt,
    runDnsHandoffEmail: !hasDns,
    reason: input.alreadyRecorded ? "redelivery_recovery" : "first_delivery",
  };
}

/**
 * True when a bundle deploy handoff should have received a buyer email
 * (receipt and/or DNS go-live instructions) but is missing at least one
 * durable sent-marker note — the same sold-capability visibility gap already
 * closed for Commerce Buy now via commerceOrders.clientReceiptEmailSentAt
 * (see commerce-buy-now-client-receipt-visibility). Stripe redelivers
 * checkout.session.completed for a finite window; a permanently-bad
 * customerEmail or a sustained Resend outage past that window leaves the
 * buyer never notified with no operator-visible signal (see
 * bundle-order-missing-buyer-email-visibility). Only meaningful when
 * customerEmail is present — planBundleWebhookSideEffects never attempts
 * either send otherwise (reason: "no_customer_email").
 */
export function isBundleHandoffMissingBuyerEmail(handoff: {
  customerEmail: string;
  stripeSessionId: string;
  notes: ReadonlyArray<string>;
}): boolean {
  if (!handoff.customerEmail.trim()) return false;
  return (
    !hasBundleReceiptEmailNote(handoff.notes, handoff.stripeSessionId) ||
    !hasBundleDnsHandoffEmailNote(handoff.notes, handoff.stripeSessionId)
  );
}
