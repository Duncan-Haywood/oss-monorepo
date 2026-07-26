/**
 * Recurring-subscription entitlement helpers for bundle/Commerce orders.
 * customer.subscription.deleted marks orders.recurringCanceledAt; sold
 * monthly capabilities must ignore canceled rows while Billing Portal and
 * Starter-upsell mutual exclusion still treat historical recurring purchases
 * as non-Starter. customer.subscription.created|updated with status
 * active|trialing clears recurringCanceledAt so resubscribers regain packs.
 * past_due|unpaid subscription.updated and invoice.payment_failed (subscription
 * invoices) re-mark recurringCanceledAt so failed renewals pause packs until
 * payment recovers to active|trialing. invoice.paid restores the same way after
 * subscriptions.retrieve proves grants + no pause_collection (do not blind-clear).
 * invoice.payment_failed must re-retrieve before mark so a stale failed after
 * recovery cannot re-pause. pause_collection on an otherwise active|trialing
 * Subscription also pauses — status alone would wrongly clear.
 */

import {
  isOrderDisputed,
  isOrderRefunded,
  orderHasFailedBillingNotice,
  type BillingNoticeType,
} from "./types";

/** True when the order ever carried a Growth/Complete/Commerce recurring Price. */
export function orderHadRecurringEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
}): boolean {
  if (order.commerceAddon) return true;
  return order.tier === "growth" || order.tier === "complete";
}

/** True when recurringCanceledAt is a finite positive timestamp. */
export function orderRecurringIsCanceled(order: {
  recurringCanceledAt?: number | null;
}): boolean {
  const at = order.recurringCanceledAt;
  return typeof at === "number" && Number.isFinite(at) && at > 0;
}

/**
 * Active sold entitlement for marketing packs / voice packs / commerce catalog.
 * Canceled subscribers keep stage=paid|live and Billing Portal access, but must
 * not keep receiving monthly fulfillment.
 */
export function orderHasActiveRecurringEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number | null;
}): boolean {
  return orderHadRecurringEntitlement(order) && !orderRecurringIsCanceled(order);
}

/**
 * Full gate for sold monthly capability delivery (marketing packs / voice
 * packs / commerce catalog + Buy now checkout): active recurring entitlement
 * AND the charge itself was never refunded or disputed. A Stripe refund or
 * dispute does not always set recurringCanceledAt (the underlying
 * Subscription can still be active while a single charge was returned), so
 * orderHasActiveRecurringEntitlement alone is not enough to gate fulfillment
 * — see refund-dispute-entitlement-gate. Money-back-received customers must
 * stop receiving paid deliverables even if their subscription row looks
 * otherwise active.
 */
export function orderGrantsSoldCapabilityEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number | null;
  refundedAt?: string;
  disputedAt?: string;
}): boolean {
  return (
    orderHasActiveRecurringEntitlement(order) &&
    !isOrderRefunded(order) &&
    !isOrderDisputed(order)
  );
}

/**
 * Recipient-selection gate for the two pause-direction webhook notices
 * (subscription-paused, payment-failed dunning). The webhook handler always
 * calls markOrdersRecurringCanceledByCustomer (which sets recurringCanceledAt
 * on the matching order) BEFORE re-reading that same order via
 * getOrdersByStripeCustomerId to pick a notice recipient — so at that read,
 * recurringCanceledAt is freshly set on the very order the notice is about.
 * orderGrantsSoldCapabilityEntitlement requires recurringCanceledAt to be
 * unset and would therefore always reject that order, silently dropping the
 * notice (see billing-notice-pause-recipient-write-before-read-fix). Use
 * orderHadRecurringEntitlement (tier/commerceAddon only, ignoring
 * recurringCanceledAt) plus the same refund/dispute exclusion instead — this
 * is the pause-notice twin of orderGrantsSoldCapabilityEntitlement, valid
 * only at a call site that reads immediately after writing that same pause.
 */
export function orderEligibleForPauseNotice(order: {
  tier: string;
  commerceAddon: boolean;
  refundedAt?: string;
  disputedAt?: string;
}): boolean {
  return orderHadRecurringEntitlement(order) && !isOrderRefunded(order) && !isOrderDisputed(order);
}

/**
 * Stripe Subscription statuses that restore CRM recurring entitlement after a
 * prior customer.subscription.deleted or past_due/unpaid / pause_collection
 * pause. past_due / unpaid must not clear — they pause via
 * stripeSubscriptionPausesRecurringEntitlement. Callers must also reject
 * pause_collection (stripeSubscriptionHasPauseCollection) before clearing —
 * paused Subs keep status active|trialing.
 */
export function stripeSubscriptionGrantsRecurringEntitlement(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Stripe Subscription statuses that pause CRM recurring entitlement while the
 * customer still has a Subscription (failed renewal before cancel). Reuses
 * orders.recurringCanceledAt; active|trialing clear restores after recovery.
 * canceled/incomplete are handled by subscription.deleted / skip (not pause).
 * pause_collection is a separate axis (status stays active) — see
 * stripeSubscriptionHasPauseCollection.
 */
export function stripeSubscriptionPausesRecurringEntitlement(
  status: string | null | undefined,
): boolean {
  return status === "past_due" || status === "unpaid";
}

/**
 * True when Stripe pause_collection is set on a Subscription. Collection pause
 * keeps status=active|trialing while invoices are not collected — CRM must
 * pause packs/catalog (same recurringCanceledAt) before the grants clear path
 * would restore entitlement for a non-paying subscriber.
 */
export function stripeSubscriptionHasPauseCollection(
  pauseCollection: unknown,
): boolean {
  return pauseCollection != null && typeof pauseCollection === "object";
}

/**
 * Extract a Stripe Subscription id from an Invoice (string or expanded
 * object). Checks the legacy top-level Invoice.subscription field first, then
 * falls back to invoice.parent.subscription_details.subscription — Stripe API
 * versions from 2025-03-31 onward removed the top-level field and nest it
 * under `parent` instead (a webhook payload signed with an older API version
 * can still send the legacy shape, so both are checked rather than switched
 * outright). Returns null for one-time invoices.
 */
export function stripeSubscriptionIdFromInvoice(invoice: {
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}): string | null {
  const fromLegacyField = subscriptionIdFromValue(invoice.subscription);
  if (fromLegacyField) return fromLegacyField;
  return subscriptionIdFromValue(invoice.parent?.subscription_details?.subscription);
}

function subscriptionIdFromValue(sub: unknown): string | null {
  if (typeof sub === "string") {
    const id = sub.trim();
    return id.length > 0 ? id : null;
  }
  if (sub && typeof sub === "object" && "id" in sub) {
    const id = (sub as { id: unknown }).id;
    if (typeof id === "string") {
      const trimmed = id.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

/**
 * Timestamp (ms) to record as orders.recurringCanceledAt when a Subscription
 * pauses CRM entitlement. Stripe API versions from 2025-03-31 onward moved
 * current_period_start/end from the Subscription itself to each
 * SubscriptionItem (a Subscription can have multiple items with different
 * billing cycles) — reading subscription.current_period_start directly no
 * longer type-checks and is not populated at runtime either. Use the first
 * item's current_period_start (every sold bundle/Commerce subscription has
 * exactly one recurring Price/item); fall back to nowMs when absent/invalid
 * rather than leaving pausedAt undefined.
 */
export function stripeSubscriptionPausedAtMs(
  subscription: {
    items?: { data?: ReadonlyArray<{ current_period_start?: unknown }> };
  },
  nowMs: number,
): number {
  const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start;
  return typeof currentPeriodStart === "number" &&
    Number.isFinite(currentPeriodStart) &&
    currentPeriodStart > 0
    ? currentPeriodStart * 1000
    : nowMs;
}

/**
 * True when an invoice.payment_failed / invoice.paid event is tied to a
 * Subscription (not a one-time invoice). Only subscription renewals should
 * pause or restore packs/catalog via the invoice twin of subscription.updated.
 */
export function invoicePaymentFailedPausesRecurringEntitlement(invoice: {
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}): boolean {
  return stripeSubscriptionIdFromInvoice(invoice) != null;
}

/**
 * True when invoice.paid may attempt CRM restore — same subscription-membership
 * gate as payment_failed. Callers must still subscriptions.retrieve and require
 * grants + !pause_collection before clearOrdersRecurringCanceledByCustomer.
 */
export function invoicePaidMayRestoreRecurringEntitlement(invoice: {
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}): boolean {
  return stripeSubscriptionIdFromInvoice(invoice) != null;
}

/**
 * True when an invoice.paid event is a subscription-cycle renewal — i.e. NOT
 * the subscription's first invoice. Stripe's checkout.session.completed
 * handler already records the first invoice's amount via recordLeadPayment
 * (OrderRecord.amountPaid); only later "subscription_cycle" invoices need
 * their own increment into lifetimeRevenueUsd via
 * recordSubscriptionRenewalPayment, or the first period would be double
 * counted. See revenue-total-usd-renewal-gap.
 */
export function invoiceIsSubscriptionRenewalCharge(invoice: {
  billing_reason?: string | null;
}): boolean {
  return invoice.billing_reason === "subscription_cycle";
}

/**
 * After subscriptions.retrieve, true when CRM should clear recurringCanceledAt
 * (active|trialing and not pause_collection). Shared by subscription.updated
 * grants path and invoice.paid restore.
 */
export function stripeSubscriptionShouldRestoreRecurringEntitlement(subscription: {
  status?: string | null;
  pause_collection?: unknown;
}): boolean {
  if (stripeSubscriptionHasPauseCollection(subscription.pause_collection)) {
    return false;
  }
  return stripeSubscriptionGrantsRecurringEntitlement(subscription.status);
}

/**
 * After subscriptions.retrieve on invoice.payment_failed, true when CRM should
 * still pause. Skip when the Subscription already grants and is not
 * pause_collection-paused — a stale/out-of-order failed must not re-pause
 * after recovery.
 */
export function stripeSubscriptionShouldPauseRecurringEntitlement(subscription: {
  status?: string | null;
  pause_collection?: unknown;
}): boolean {
  if (stripeSubscriptionHasPauseCollection(subscription.pause_collection)) {
    return true;
  }
  return stripeSubscriptionPausesRecurringEntitlement(subscription.status);
}

export type RecurringEntitlementPausedStage = "paid" | "live";

export interface RecurringEntitlementPausedLead {
  slug: string;
  businessName: string;
  stage: RecurringEntitlementPausedStage;
  /** Earliest recurringCanceledAt among paused recurring orders (unix ms). */
  pausedAtMs: number;
  /** True when any paused recurring order still has a Stripe Customer for Manage billing. */
  hasStripeCustomerId: boolean;
}

type RecurringPausedOrder = {
  leadSlug: string;
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number | null;
  stripeCustomerId?: string | null;
};

/**
 * Paid/live Growth/Complete/Commerce leads whose recurring entitlement is
 * paused or canceled (orders.recurringCanceledAt). These silently drop out of
 * marketingPacksDue / voice / catalog panels — surface them so operators can
 * chase Billing Portal recovery. A lead with any still-active recurring order
 * is excluded. Sorted oldest pause first (most urgent recovery).
 */
export function listRecurringEntitlementPaused(
  leads: ReadonlyArray<{
    slug: string;
    businessName: string;
    stage: string;
  }>,
  orders: ReadonlyArray<RecurringPausedOrder>,
): RecurringEntitlementPausedLead[] {
  const ordersBySlug = new Map<string, RecurringPausedOrder[]>();
  for (const order of orders) {
    const list = ordersBySlug.get(order.leadSlug);
    if (list) {
      list.push(order);
    } else {
      ordersBySlug.set(order.leadSlug, [order]);
    }
  }

  const paused: RecurringEntitlementPausedLead[] = [];
  for (const lead of leads) {
    if (lead.stage !== "paid" && lead.stage !== "live") continue;
    const leadOrders = ordersBySlug.get(lead.slug) ?? [];
    const recurringOrders = leadOrders.filter(orderHadRecurringEntitlement);
    if (recurringOrders.length === 0) continue;
    if (recurringOrders.some(orderHasActiveRecurringEntitlement)) continue;

    let pausedAtMs: number | null = null;
    let hasStripeCustomerId = false;
    for (const order of recurringOrders) {
      if (!orderRecurringIsCanceled(order)) continue;
      const at = order.recurringCanceledAt;
      if (typeof at === "number" && Number.isFinite(at) && at > 0) {
        if (pausedAtMs === null || at < pausedAtMs) {
          pausedAtMs = at;
        }
      }
      if (typeof order.stripeCustomerId === "string" && order.stripeCustomerId.trim()) {
        hasStripeCustomerId = true;
      }
    }
    if (pausedAtMs === null) continue;

    paused.push({
      slug: lead.slug,
      businessName: lead.businessName,
      stage: lead.stage,
      pausedAtMs,
      hasStripeCustomerId,
    });
  }

  return paused.sort((a, b) => a.pausedAtMs - b.pausedAtMs);
}

/**
 * Age in whole hours since the oldest recurring entitlement pause; null when
 * none. Pass nowMs from the caller — never Date.now() inside list helpers.
 */
export function oldestRecurringEntitlementPausedAgeHours(
  paused: ReadonlyArray<{ pausedAtMs: number }>,
  nowMs: number,
): number | null {
  if (paused.length === 0) return null;
  const oldest = paused[0];
  if (!oldest || !Number.isFinite(oldest.pausedAtMs) || oldest.pausedAtMs <= 0) {
    return null;
  }
  if (!Number.isFinite(nowMs) || nowMs < oldest.pausedAtMs) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - oldest.pausedAtMs) / (60 * 60 * 1000)));
}

export interface OrderBillingNoticeSendFailure {
  slug: string;
  businessName: string;
  stripeSessionId: string;
  noticeType: BillingNoticeType;
  failedAtMs: number;
}

type BillingNoticeFailureOrder = {
  leadSlug: string;
  stripeSessionId?: string;
  lastBillingNoticeSendFailedAt?: number | null;
  lastBillingNoticeSendFailedType?: BillingNoticeType | null;
};

/**
 * Bundle/Commerce orders whose most recent billing-notice send (dunning /
 * payment-recovered / subscription-paused / subscription-resumed) failed and
 * hasn't since been superseded by a successful one — see
 * billing-notice-send-failure-visibility. Sorted oldest failure first (most
 * urgent — the customer has gone longest without a billing update reaching
 * them).
 */
export function listOrdersWithFailedBillingNotice(
  leads: ReadonlyArray<{ slug: string; businessName: string }>,
  orders: ReadonlyArray<BillingNoticeFailureOrder>,
): OrderBillingNoticeSendFailure[] {
  const businessNameBySlug = new Map(leads.map((lead) => [lead.slug, lead.businessName]));
  const failed: OrderBillingNoticeSendFailure[] = [];
  for (const order of orders) {
    if (!orderHasFailedBillingNotice(order)) continue;
    if (!order.lastBillingNoticeSendFailedType) continue;
    failed.push({
      slug: order.leadSlug,
      businessName: businessNameBySlug.get(order.leadSlug) ?? order.leadSlug,
      stripeSessionId: order.stripeSessionId ?? "",
      noticeType: order.lastBillingNoticeSendFailedType,
      failedAtMs: order.lastBillingNoticeSendFailedAt as number,
    });
  }
  return failed.sort((a, b) => a.failedAtMs - b.failedAtMs);
}

/**
 * Age in whole hours since the oldest still-failing billing-notice send;
 * null when none. Pass nowMs from the caller — never Date.now() inside list
 * helpers.
 */
export function oldestBillingNoticeSendFailedAgeHours(
  failed: ReadonlyArray<{ failedAtMs: number }>,
  nowMs: number,
): number | null {
  if (failed.length === 0) return null;
  const oldest = failed[0];
  if (!oldest || !Number.isFinite(oldest.failedAtMs) || oldest.failedAtMs <= 0) {
    return null;
  }
  if (!Number.isFinite(nowMs) || nowMs < oldest.failedAtMs) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - oldest.failedAtMs) / (60 * 60 * 1000)));
}
