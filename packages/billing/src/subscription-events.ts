// Pure rules for applying a verified, org-bound webhook event to an org's stored subscription.
// The app owns storage (idempotency table, subscription row, pending checkouts, audit log); these
// rules decide WHETHER the event may change the row and WHAT the bookkeeping fields become.
//
// Order of operations an app should follow (grants' services/billing/webhooks.ts does exactly this):
//   1. Verify + normalize:   event = await provider.parseWebhook(request)   (throws -> 400/401)
//   2. Idempotency:          insert (provider, event.providerEventId) once; processed -> "duplicate"
//   3. Bind the org:         an existing row whose providerSubscriptionId matches, else
//                            resolveCheckoutToken(...) on event.checkoutToken. Never custom_data.orgId.
//   4. Decide:               decideSubscriptionUpdate(currentRow, event, ...)
//   5. Consume the token:    atomic one-time update; no row updated -> ignore "checkout token replay"
//   6. Write:                upsert the row with the decision's providerUpdatedAt / pastDueSince
//   7. Answer 200 with applied / duplicate / ignored (+ reason) so the provider stops retrying.
import type { SubscriptionStatus } from "./entitlement.ts";
import { nextPastDueSince } from "./grace.ts";
import type { BillingWebhookEvent, ProviderSubscription } from "./provider.ts";

/** The fields of the org's stored subscription row these rules read. */
export interface StoredSubscription {
  status: SubscriptionStatus;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  /** Provider occurred_at of the last applied event (ordering watermark). */
  providerUpdatedAt: Date | null;
  pastDueSince: Date | null;
}

export type IgnoreReason =
  | "no subscription data"
  | "unknown plan"
  | "customer mismatch"
  | "out-of-order event"
  | "stale subscription";

export type SubscriptionDecision =
  | {
      apply: true;
      subscription: ProviderSubscription;
      /** Store as the new ordering watermark. */
      providerUpdatedAt: Date | null;
      /** Store as the grace start (null unless the new status is past_due). */
      pastDueSince: Date | null;
    }
  | { apply: false; reason: IgnoreReason };

/** Why `event` must not change `current`, or null when it may be applied (ordering rules only). */
export function staleReason(
  current: StoredSubscription | null | undefined,
  s: ProviderSubscription,
  occurredAt: Date | null,
): "out-of-order event" | "stale subscription" | null {
  if (!current) return null;
  const sameSub = current.providerSubscriptionId === s.providerSubscriptionId;
  const otherSub = Boolean(current.providerSubscriptionId) && !sameSub;
  const last = current.providerSubscriptionId ? current.providerUpdatedAt : null;
  // Older than the last event applied to the org's subscription: a late, out-of-order delivery.
  if (last && occurredAt && occurredAt.getTime() < last.getTime()) {
    return sameSub ? "out-of-order event" : "stale subscription";
  }
  // A late cancel of an old subscription must not wipe a comp grant or a newer subscription.
  if (s.status === "canceled" && (current.status === "comp" || otherSub)) {
    return "stale subscription";
  }
  return null;
}

/**
 * Decides whether an org-bound event may update the org's subscription. `isPurchasable` must accept
 * only plans sold through checkout: webhooks never grant staff-only plans such as "comp".
 */
export function decideSubscriptionUpdate(
  current: StoredSubscription | null | undefined,
  event: Pick<BillingWebhookEvent, "subscription" | "occurredAt">,
  opts: { isPurchasable: (planKey: string) => boolean; now: Date },
): SubscriptionDecision {
  const s = event.subscription;
  if (!s) return { apply: false, reason: "no subscription data" };
  if (!opts.isPurchasable(s.planKey)) return { apply: false, reason: "unknown plan" };
  // Never let another provider customer take over an org's subscription (checkout reuses the org's
  // customer, so a legitimate re-subscription always matches). Audit this one: it is an attack or
  // an operator mistake.
  if (current?.providerCustomerId && current.providerCustomerId !== s.providerCustomerId) {
    return { apply: false, reason: "customer mismatch" };
  }
  const stale = staleReason(current, s, event.occurredAt);
  if (stale) return { apply: false, reason: stale };
  const sameSub = current?.providerSubscriptionId === s.providerSubscriptionId;
  return {
    apply: true,
    subscription: s,
    // An event without a timestamp never moves the ordering watermark.
    providerUpdatedAt: event.occurredAt ?? (sameSub ? (current?.providerUpdatedAt ?? null) : null),
    pastDueSince: nextPastDueSince(
      current ?? null,
      sameSub,
      s.status,
      event.occurredAt ?? opts.now,
    ),
  };
}

// --- Lifecycle stamps (admin metrics + owner notifications) ------------------------------------

/** Statuses that mean the customer is being billed (MRR counts these; trialing is not revenue). */
export const PAID_SUBSCRIPTION_STATUSES = ["active", "past_due"] as const;

export const isPaidStatus = (status: string | null | undefined): boolean =>
  status === "active" || status === "past_due";

/** First-time stamps an app keeps on its subscription row (all nullable, set once). */
export interface LifecycleStamps {
  /** First time the org's subscription was seen trialing. */
  trialStartedAt: Date | null;
  /** First time it was seen paid (active), e.g. a trial converting. */
  firstPaidAt: Date | null;
  /** When it was last seen canceled; cleared when it is paid or trialing again. */
  canceledAt: Date | null;
}

/**
 * The stamps after applying an event that moves the subscription to `status` at `at`. Stamps only
 * record what webhooks report; nothing is back-filled or inferred.
 */
export function nextLifecycleStamps(
  current: Partial<LifecycleStamps> | null | undefined,
  status: string,
  at: Date,
): LifecycleStamps {
  const trialStartedAt = current?.trialStartedAt ?? (status === "trialing" ? at : null);
  const firstPaidAt = current?.firstPaidAt ?? (status === "active" ? at : null);
  const canceledAt =
    status === "canceled"
      ? (current?.canceledAt ?? at)
      : status === "active" || status === "trialing"
        ? null
        : (current?.canceledAt ?? null);
  return { trialStartedAt, firstPaidAt, canceledAt };
}

/**
 * True when an applied event starts a NEW paid subscription for the org: it is now active and the
 * org was not already paying on this subscription (first payment, a trial converting, or a
 * re-subscription after a cancel). Used for the owner's "new paid subscription" email.
 */
export function isNewPaidSubscription(
  current: { status: string; providerSubscriptionId: string | null } | null | undefined,
  next: { status: string; providerSubscriptionId: string },
): boolean {
  if (next.status !== "active") return false;
  if (!current) return true;
  if (current.providerSubscriptionId !== next.providerSubscriptionId) return true;
  return !isPaidStatus(current.status);
}
