// Billing: what an org's plan allows, checkout and portal sessions, and the Paddle webhook.
// Pure rules live in packages/billing; this file owns storage. See docs/BILLING.md.
//
// Org binding (security): a webhook event reaches an org ONLY through
//   1. the subscription row that already holds the event's providerSubscriptionId, or
//   2. a valid, unexpired checkout token (custom_data.checkoutToken) that the first subscription
//      using it consumes atomically.
// Raw custom_data (orgId, planKey, ...) is never read, and the plan comes only from the billed price.
//
// Lapsed or missing subscriptions fall back to the Free plan. Nothing is ever deleted or hidden:
// over the limit, an org keeps reading and exporting every job; it cannot start new pay apps or
// add jobs or members until it closes finished jobs or upgrades.
import {
  type BillingInterval,
  CHECKOUT_TOKEN_TTL_MS,
  checkoutPriceKey,
  decideSubscriptionUpdate,
  type Entitlement,
  isNewPaidSubscription,
  newCheckoutId,
  nextLifecycleStamps,
  PromoCodeError,
  parseCheckoutToken,
  resolveCheckoutToken,
  resolveEntitlement,
  signCheckoutToken,
  WebhookSignatureError,
} from "@billing";
import type { BillingDto } from "@shared/api/types";
import { COMP_PLAN, catalog, FREE_PLAN, type Plan, PUBLIC_PLANS } from "@shared/plans";
import { and, count, eq, isNull, or } from "drizzle-orm";
import type { AppContext } from "../context";
import { billingEvents, member, pendingCheckouts, projects, subscriptions } from "../db/schema";
import { AppError, badRequest, paymentRequired } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Tenant } from "../types";
import { notifyOwnerNewPaid } from "./owner-notify";

type SubscriptionRow = typeof subscriptions.$inferSelect;

export interface OrgPlan {
  /** The plan whose limits apply now (Free when the subscription is missing or lapsed). */
  plan: Plan;
  entitlement: Entitlement<Plan>;
  subscription: SubscriptionRow | null;
}

const billingUnavailable = () =>
  new AppError(503, "billing_unavailable", "Paid plans are not available yet on this deployment");

export async function getSubscription(ctx: AppContext, orgId: string) {
  return (
    (await ctx.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get()) ?? null
  );
}

export async function orgPlan(ctx: AppContext, orgId: string): Promise<OrgPlan> {
  const subscription = await getSubscription(ctx, orgId);
  const entitlement = resolveEntitlement<Plan>(subscription, {
    getPlan: catalog.get,
    now: ctx.now(),
    compPlan: COMP_PLAN,
  });
  const plan = entitlement.active && entitlement.plan ? entitlement.plan : FREE_PLAN;
  return { plan, entitlement, subscription };
}

export async function usage(ctx: AppContext, orgId: string) {
  const [jobs, members] = await Promise.all([
    ctx.db
      .select({ n: count() })
      .from(projects)
      .where(
        and(
          eq(projects.orgId, orgId),
          eq(projects.status, "active"),
          // The sample job is for trying the product, not billing: it never counts.
          eq(projects.isSample, false),
        ),
      )
      .get(),
    ctx.db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)).get(),
  ]);
  return { activeJobs: jobs?.n ?? 0, members: members?.n ?? 0 };
}

const upgradeHint = "Close finished jobs or upgrade on the Billing page.";

/** Before a job becomes active (new, or reopened). */
export async function assertCanAddActiveJob(ctx: AppContext, orgId: string) {
  const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
  if (plan.maxActiveJobs !== null && used.activeJobs >= plan.maxActiveJobs) {
    throw paymentRequired(
      `The ${plan.name} plan allows ${plan.maxActiveJobs} active job${plan.maxActiveJobs === 1 ? "" : "s"}. ${upgradeHint}`,
    );
  }
}

/** Before a new pay application: the org must be within its plan's active-job limit. */
export async function assertWithinJobLimit(ctx: AppContext, orgId: string) {
  const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
  if (plan.maxActiveJobs !== null && used.activeJobs > plan.maxActiveJobs) {
    throw paymentRequired(
      `Your organization has ${used.activeJobs} active jobs; the ${plan.name} plan allows ${plan.maxActiveJobs}. ${upgradeHint}`,
    );
  }
}

export async function assertCanAddMember(ctx: AppContext, orgId: string) {
  const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
  if (plan.maxMembers !== null && used.members >= plan.maxMembers) {
    throw paymentRequired(
      `The ${plan.name} plan allows ${plan.maxMembers} user${plan.maxMembers === 1 ? "" : "s"}. Upgrade on the Billing page.`,
    );
  }
}

export async function billingSummary(ctx: AppContext, orgId: string): Promise<BillingDto> {
  const [{ plan, entitlement, subscription }, used] = await Promise.all([
    orgPlan(ctx, orgId),
    usage(ctx, orgId),
  ]);
  return {
    plan: { key: plan.key, name: plan.name },
    status: entitlement.status,
    lapsed: subscription !== null && !entitlement.active,
    graceUntil: entitlement.graceUntil?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    limits: { activeJobs: plan.maxActiveJobs, members: plan.maxMembers },
    usage: used,
    checkoutAvailable: ctx.billing !== null,
    portalAvailable: ctx.billing !== null && Boolean(subscription?.providerCustomerId),
    plans: PUBLIC_PLANS.map(publicPlan),
  };
}

export const publicPlan = (p: Plan) => ({
  key: p.key,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  annualPriceCents: p.annualPriceCents,
  maxActiveJobs: p.maxActiveJobs,
  maxMembers: p.maxMembers,
  features: [...p.features],
  purchasable: p.purchasable,
});

function checkoutSecret(ctx: AppContext): string {
  const s = ctx.env.AUTH_SECRET;
  if (!s || s.length < 32) throw billingUnavailable();
  return s;
}

export async function startCheckout(
  ctx: AppContext,
  tenant: Tenant,
  customerEmail: string,
  input: { plan: string; interval: BillingInterval; promoCode?: string | undefined },
): Promise<{ url: string }> {
  const billing = ctx.billing;
  if (!billing) throw billingUnavailable();
  const plan = catalog.get(input.plan);
  if (!plan || !plan.purchasable) throw badRequest("Unknown plan");
  if (input.interval === "year" && plan.annualPriceCents === null) {
    throw badRequest("That plan is not sold annually");
  }
  const secret = checkoutSecret(ctx);
  const current = await getSubscription(ctx, tenant.orgId);
  const id = newCheckoutId();
  await ctx.db.insert(pendingCheckouts).values({
    id,
    orgId: tenant.orgId,
    planKey: plan.key,
    interval: input.interval,
    createdBy: tenant.userId,
    expiresAt: new Date(ctx.now().getTime() + CHECKOUT_TOKEN_TTL_MS),
  });
  const base = new URL(ctx.env.APP_URL);
  const back = (q: string) => new URL(`/orgs/${tenant.orgId}/billing?${q}`, base).toString();
  try {
    return await billing.createCheckout({
      checkoutToken: await signCheckoutToken(secret, id, tenant.orgId),
      planKey: checkoutPriceKey(plan.key, input.interval),
      interval: input.interval,
      customerEmail,
      successUrl: back("checkout=success"),
      cancelUrl: back("checkout=cancel"),
      promoCode: input.promoCode,
      providerCustomerId: current?.providerCustomerId ?? null,
    });
  } catch (e) {
    if (e instanceof PromoCodeError) throw badRequest("That promo code is not valid");
    throw e;
  }
}

export async function startPortal(ctx: AppContext, orgId: string): Promise<{ url: string }> {
  if (!ctx.billing) throw billingUnavailable();
  const sub = await getSubscription(ctx, orgId);
  if (!sub?.providerCustomerId) throw badRequest("This organization has no paid subscription");
  const returnUrl = new URL(`/orgs/${orgId}/billing`, ctx.env.APP_URL).toString();
  return ctx.billing.createPortalSession(sub.providerCustomerId, returnUrl);
}

// ---- Webhook ---------------------------------------------------------------------------------------

export type WebhookResult =
  | { outcome: "applied" }
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: string };

export class InvalidWebhookError extends Error {}

/** Verifies, records once, binds to an org and applies a provider webhook. */
export async function handleWebhook(ctx: AppContext, request: Request): Promise<WebhookResult> {
  const billing = ctx.billing;
  if (!billing) throw billingUnavailable();
  let event: Awaited<ReturnType<typeof billing.parseWebhook>>;
  try {
    event = await billing.parseWebhook(request);
  } catch (e) {
    if (e instanceof WebhookSignatureError) throw new InvalidWebhookError(e.message);
    throw e;
  }
  if (!event.providerEventId) throw new InvalidWebhookError("Webhook event has no id");
  const provider = billing.name;

  // 1. Idempotency: one row per (provider, event id); a processed row is a duplicate delivery.
  const inserted = await ctx.db
    .insert(billingEvents)
    .values({
      id: newId("bev"),
      provider,
      providerEventId: event.providerEventId,
      type: event.type,
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
    if (existing.processedAt) return { outcome: "duplicate" };
    eventRowId = existing.id;
  }

  const finish = async (result: WebhookResult, orgId: string | null) => {
    await ctx.db
      .update(billingEvents)
      .set({
        processedAt: ctx.now(),
        orgId,
        outcome: result.outcome === "ignored" ? "ignored" : "applied",
        reason: result.outcome === "ignored" ? result.reason : null,
      })
      .where(eq(billingEvents.id, eventRowId));
    return result;
  };
  const ignore = (reason: string, orgId: string | null = null) => {
    if (reason !== "no subscription data") {
      ctx.logger.warn("billing.webhook_ignored", {
        provider,
        eventId: event.providerEventId,
        reason,
      });
    }
    return finish({ outcome: "ignored", reason }, orgId);
  };

  const s = event.subscription;
  if (!s) return ignore("no subscription data");

  // 2. Bind the org: the row that already owns this subscription, else the checkout token.
  const owner = await ctx.db
    .select({ orgId: subscriptions.orgId })
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, s.providerSubscriptionId))
    .get();
  let orgId = owner?.orgId ?? null;
  let checkoutId: string | null = null;
  if (!orgId) {
    if (!event.checkoutToken) return ignore("unknown org");
    const parsed = parseCheckoutToken(event.checkoutToken);
    const row = parsed
      ? await ctx.db
          .select()
          .from(pendingCheckouts)
          .where(eq(pendingCheckouts.id, parsed.checkoutId))
          .get()
      : null;
    const r = await resolveCheckoutToken(
      checkoutSecret(ctx),
      event.checkoutToken,
      row,
      s.providerSubscriptionId,
      ctx.now(),
    );
    if (!r.ok) return ignore(r.reason);
    orgId = r.orgId;
    checkoutId = r.checkoutId;
  }

  // 3. Decide (customer mismatch, ordering, staff-only plans).
  const current = await getSubscription(ctx, orgId);
  const decision = decideSubscriptionUpdate(current, event, {
    isPurchasable: catalog.isPurchasable,
    now: ctx.now(),
  });
  if (!decision.apply) {
    if (decision.reason === "customer mismatch") {
      ctx.logger.error("billing.customer_mismatch", { orgId, eventId: event.providerEventId });
    }
    return ignore(decision.reason, orgId);
  }

  // 4. Consume the checkout token once (a retried delivery of the same subscription passes).
  if (checkoutId) {
    const consumed = await ctx.db
      .update(pendingCheckouts)
      .set({ consumedAt: ctx.now(), providerSubscriptionId: s.providerSubscriptionId })
      .where(
        and(
          eq(pendingCheckouts.id, checkoutId),
          or(
            isNull(pendingCheckouts.consumedAt),
            eq(pendingCheckouts.providerSubscriptionId, s.providerSubscriptionId),
          ),
        ),
      )
      .returning({ id: pendingCheckouts.id });
    if (consumed.length === 0) return ignore("checkout token replay", orgId);
  }

  // 5. Write. The price is stored exactly as this event reports it (the only MRR source), and the
  // lifecycle stamps only ever record what webhooks said (never back-filled).
  const price = s.price;
  const stamps = nextLifecycleStamps(current, s.status, event.occurredAt ?? ctx.now());
  const values = {
    priceAmountMinor: price?.unitAmountMinor ?? null,
    priceCurrency: price?.currency ?? null,
    billingInterval: price?.interval ?? null,
    billingFrequency: price?.frequency ?? null,
    priceQuantity: price?.quantity ?? null,
    priceDiscounted: price ? price.discounted : null,
    ...stamps,
    planKey: s.planKey,
    status: s.status,
    provider,
    providerCustomerId: s.providerCustomerId,
    providerSubscriptionId: s.providerSubscriptionId,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    providerUpdatedAt: decision.providerUpdatedAt,
    pastDueSince: decision.pastDueSince,
  };
  await ctx.db
    .insert(subscriptions)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { ...values, updatedAt: ctx.now() } });
  ctx.logger.info("billing.subscription_applied", { orgId, plan: s.planKey, status: s.status });
  if (isNewPaidSubscription(current, s)) await notifyOwnerNewPaid(ctx, orgId);
  return finish({ outcome: "applied" }, orgId);
}

/** Lien waivers are a Crew-and-up feature. Existing waivers stay readable after a downgrade. */
export async function assertLienWaivers(ctx: AppContext, orgId: string) {
  const { plan } = await orgPlan(ctx, orgId);
  if (!plan.lienWaivers) {
    throw paymentRequired(
      `Lien waivers are included in the Crew plan and up; you are on ${plan.name}. Upgrade on the Billing page.`,
    );
  }
}

/** QuickBooks Online sync is a Crew-and-up feature. A downgrade keeps the record of what was sent. */
export async function assertQuickBooks(ctx: AppContext, orgId: string) {
  const { plan } = await orgPlan(ctx, orgId);
  if (!plan.quickbooks) {
    throw paymentRequired(
      `QuickBooks Online is included in the Crew plan and up; you are on ${plan.name}. Upgrade on the Billing page.`,
    );
  }
  return plan;
}

/** Job costing is a Crew-and-up feature. Budgets and costs stay readable after a downgrade. */
export async function assertJobCosting(ctx: AppContext, orgId: string) {
  const { plan } = await orgPlan(ctx, orgId);
  if (!plan.jobCosting) {
    throw paymentRequired(
      `Job costing is included in the Crew plan and up; you are on ${plan.name}. Upgrade on the Billing page.`,
    );
  }
  return plan;
}
