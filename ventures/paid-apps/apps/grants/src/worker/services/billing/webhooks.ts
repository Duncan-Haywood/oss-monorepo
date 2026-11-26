// Applies normalized merchant-of-record webhook events: idempotent (billing_events unique on
// provider + providerEventId), upserts the org's subscription, writes the audit log.
//
// Org binding (security): the org comes ONLY from
//   1. an existing subscription row whose (provider, providerSubscriptionId) matches the event, or
//   2. a valid, unexpired, unconsumed checkout token in custom_data (see ./checkout.ts), which is
//      consumed by the first subscription that uses it.
// Raw custom_data fields (orgId, planKey, ...) are never read: anyone can craft a checkout with them.
// An org's subscription is never overwritten by a different provider customer.
//
// Ordering: events carry the provider's occurred_at. Events older than the last one applied to the
// org's subscription (subscriptions.providerUpdatedAt) are recorded and ignored.
import { isPaidPlanKey } from "@shared/billing/plans";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { billingEvents, subscriptions } from "../../db/schema";
import { newId } from "../../lib/ids";
import type { BillingWebhookEvent } from "../../ports/billing-provider";
import { audit } from "../privacy/audit";
import { consumePendingCheckout, resolveCheckoutToken } from "./checkout";

type ProviderSubscription = NonNullable<BillingWebhookEvent["subscription"]>;
type SubscriptionRow = typeof subscriptions.$inferSelect;

export interface ProviderSubscriptionState {
  /** Provider occurred_at of the event being applied (the ordering watermark). */
  providerUpdatedAt: Date | null;
  /** Start of the past_due grace period; null unless the status is past_due. */
  pastDueSince: Date | null;
}

/** Insert or update the org's subscription from provider data (also used by the fake checkout). */
export async function upsertProviderSubscription(
  ctx: AppContext,
  orgId: string,
  provider: string,
  s: ProviderSubscription,
  metadata: Record<string, unknown> = {},
  state: ProviderSubscriptionState = { providerUpdatedAt: null, pastDueSince: null },
): Promise<void> {
  const values = {
    planKey: s.planKey,
    status: s.status,
    provider,
    providerCustomerId: s.providerCustomerId,
    providerSubscriptionId: s.providerSubscriptionId,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    providerUpdatedAt: state.providerUpdatedAt,
    pastDueSince: s.status === "past_due" ? state.pastDueSince : null,
    metadata,
  };
  await ctx.db
    .insert(subscriptions)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { ...values, updatedAt: ctx.now() } });
}

export type ApplyResult =
  | { outcome: "applied"; eventId: string }
  | { outcome: "duplicate"; eventId: string }
  | { outcome: "ignored"; eventId: string; reason: string };

/** The org that already owns this provider subscription, if any (trusted binding #1). */
async function orgForProviderSubscription(
  ctx: AppContext,
  provider: string,
  providerSubscriptionId: string | null | undefined,
): Promise<string | null> {
  if (!providerSubscriptionId) return null;
  const row = await ctx.db
    .select({ orgId: subscriptions.orgId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, provider),
        eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
      ),
    )
    .get();
  return row?.orgId ?? null;
}

export async function applyBillingEvent(
  ctx: AppContext,
  provider: string,
  event: BillingWebhookEvent,
): Promise<ApplyResult> {
  if (!event.providerEventId) throw new Error("Webhook event has no id");
  let orgId = await orgForProviderSubscription(
    ctx,
    provider,
    event.subscription?.providerSubscriptionId ?? event.providerSubscriptionId,
  );

  const inserted = await ctx.db
    .insert(billingEvents)
    .values({
      id: newId("bev"),
      provider,
      providerEventId: event.providerEventId,
      type: event.type,
      orgId,
      payload: event.raw,
      occurredAt: event.occurredAt,
    })
    .onConflictDoNothing({ target: [billingEvents.provider, billingEvents.providerEventId] })
    .returning({ id: billingEvents.id });

  let eventRowId = inserted[0]?.id;
  if (!eventRowId) {
    const existing = await ctx.db
      .select({ id: billingEvents.id, processedAt: billingEvents.processedAt })
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.provider, provider),
          eq(billingEvents.providerEventId, event.providerEventId),
        ),
      )
      .get();
    if (!existing) throw new Error("billing event vanished");
    // Already processed -> duplicate delivery. Unprocessed (an earlier attempt failed) -> retry.
    if (existing.processedAt) return { outcome: "duplicate", eventId: existing.id };
    eventRowId = existing.id;
  }
  const ignored = (reason: string): ApplyResult => ({
    outcome: "ignored",
    eventId: eventRowId,
    reason,
  });

  try {
    let result: ApplyResult;
    const s = event.subscription;
    if (!s) {
      result = ignored("no subscription data");
    } else if (!isPaidPlanKey(s.planKey)) {
      // Providers may only grant purchasable plans; "comp" is granted by staff, never by webhook.
      result = ignored("unknown plan");
    } else {
      let checkoutId: string | null = null;
      let unbound = "unknown org";
      if (!orgId && event.checkoutToken) {
        const r = await resolveCheckoutToken(ctx, event.checkoutToken, s.providerSubscriptionId);
        if (r.ok) {
          orgId = r.orgId;
          checkoutId = r.checkoutId;
        } else {
          unbound = r.reason;
          ctx.logger.warn("billing.checkout_token_rejected", {
            provider,
            providerEventId: event.providerEventId,
            reason: r.reason,
          });
        }
      }
      result = orgId
        ? await applySubscription(ctx, provider, event, s, orgId, checkoutId, eventRowId)
        : ignored(unbound);
    }
    await ctx.db
      .update(billingEvents)
      .set({
        processedAt: ctx.now(),
        error: result.outcome === "ignored" ? result.reason : null,
        orgId,
      })
      .where(eq(billingEvents.id, eventRowId));
    return result;
  } catch (e) {
    await ctx.db
      .update(billingEvents)
      .set({ error: String(e).slice(0, 500) })
      .where(eq(billingEvents.id, eventRowId));
    throw e;
  }
}

/** Why `event` must not change `current`, or null when it may be applied. */
function staleReason(
  current: SubscriptionRow | undefined,
  s: ProviderSubscription,
  occurredAt: Date | null,
): string | null {
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

async function applySubscription(
  ctx: AppContext,
  provider: string,
  event: BillingWebhookEvent,
  s: ProviderSubscription,
  orgId: string,
  checkoutId: string | null,
  eventRowId: string,
): Promise<ApplyResult> {
  const ignored = (reason: string): ApplyResult => ({
    outcome: "ignored",
    eventId: eventRowId,
    reason,
  });
  const current = await ctx.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .get();

  if (current?.providerCustomerId && current.providerCustomerId !== s.providerCustomerId) {
    // Never let another provider customer take over an org's subscription (checkout reuses the
    // org's customer, so a legitimate re-subscription always matches).
    await audit(ctx, {
      orgId,
      actorType: "system",
      action: "billing.subscription_conflict",
      targetType: "subscription",
      targetId: s.providerSubscriptionId,
      metadata: {
        provider,
        eventType: event.type,
        providerEventId: event.providerEventId,
        existingCustomerId: current.providerCustomerId,
        existingSubscriptionId: current.providerSubscriptionId,
        eventCustomerId: s.providerCustomerId,
      },
    });
    return ignored("customer mismatch");
  }

  const stale = staleReason(current, s, event.occurredAt);
  if (stale) return ignored(stale);

  // One-time token: the first subscription to use it wins, even under concurrent deliveries.
  if (
    checkoutId &&
    !(await consumePendingCheckout(ctx, checkoutId, orgId, s.providerSubscriptionId))
  ) {
    return ignored("checkout token replay");
  }

  const sameSub = current?.providerSubscriptionId === s.providerSubscriptionId;
  const alreadyPastDue = sameSub && current?.status === "past_due" ? current.pastDueSince : null;
  await upsertProviderSubscription(
    ctx,
    orgId,
    provider,
    s,
    { lastEventType: event.type, lastEventId: event.providerEventId },
    {
      // An event without a timestamp never moves the ordering watermark.
      providerUpdatedAt:
        event.occurredAt ?? (sameSub ? (current?.providerUpdatedAt ?? null) : null),
      // Grace runs from the FIRST past_due event; later past_due events keep that start.
      pastDueSince: alreadyPastDue ?? event.occurredAt ?? ctx.now(),
    },
  );
  await audit(ctx, {
    orgId,
    actorType: "system",
    action: "billing.subscription_updated",
    targetType: "subscription",
    targetId: s.providerSubscriptionId,
    metadata: {
      provider,
      eventType: event.type,
      planKey: s.planKey,
      status: s.status,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      occurredAt: event.occurredAt?.toISOString() ?? null,
      ...(checkoutId ? { checkoutId } : {}),
    },
  });
  return { outcome: "applied", eventId: eventRowId };
}
