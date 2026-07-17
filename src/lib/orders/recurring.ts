/**
 * Recurring-subscription entitlement helpers for bundle/Commerce orders.
 * customer.subscription.deleted marks orders.recurringCanceledAt; sold
 * monthly capabilities must ignore canceled rows while Billing Portal and
 * Starter-upsell mutual exclusion still treat historical recurring purchases
 * as non-Starter. customer.subscription.created|updated with status
 * active|trialing clears recurringCanceledAt so resubscribers regain packs.
 * past_due|unpaid subscription.updated and invoice.payment_failed (subscription
 * invoices) re-mark recurringCanceledAt so failed renewals pause packs until
 * payment recovers to active|trialing. pause_collection on an otherwise
 * active|trialing Subscription also pauses — status alone would wrongly clear.
 */

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
 * True when an invoice.payment_failed event is tied to a Subscription (not a
 * one-time invoice). Only subscription renewals should pause packs/catalog.
 */
export function invoicePaymentFailedPausesRecurringEntitlement(invoice: {
  subscription?: unknown;
}): boolean {
  const sub = invoice.subscription;
  if (typeof sub === "string") {
    return sub.trim().length > 0;
  }
  if (sub && typeof sub === "object" && "id" in sub) {
    const id = (sub as { id: unknown }).id;
    return typeof id === "string" && id.trim().length > 0;
  }
  return false;
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
