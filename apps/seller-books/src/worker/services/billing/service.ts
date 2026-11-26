// Billing: what an organization's plan allows, checkout and portal sessions, and the Paddle webhook.
// Pure rules live in packages/billing; this file owns storage. See docs/BILLING.md. Checkout, portal
// and webhook are ported from apps/cmmc (the same rules as apps/payapps and apps/jobshop-quote); the
// limits are this app's own: platforms imported from, members, and orders a month.
//
// Org binding (security): a webhook event reaches an org ONLY through
//   1. the subscription row that already holds the event's providerSubscriptionId, or
//   2. a valid, unexpired checkout token (custom_data.checkoutToken) that the first subscription
//      using it consumes atomically.
// Raw custom_data (orgId, planKey, ...) is never read, and the plan comes only from the billed price.
//
// Lapsed or missing subscriptions fall back to the Free plan. Nothing is ever deleted or hidden: a
// lapsed org keeps reading and exporting every sale, report and worksheet it already has; only new
// imports past the free limits and new members wait for a paid plan.
import {
  type BillingInterval,
  CHECKOUT_TOKEN_TTL_MS,
  checkoutPriceKey,
  decideSubscriptionUpdate,
  type Entitlement,
  newCheckoutId,
  PromoCodeError,
  parseCheckoutToken,
  resolveCheckoutToken,
  resolveEntitlement,
  signCheckoutToken,
  WebhookSignatureError,
} from "@billing";
import { PLATFORM_LABELS, type Platform } from "@shared/enums";
import {
  type BillingDto,
  COMP_PLAN,
  catalog,
  FREE_PLAN,
  type Plan,
  type PlanDto,
  PUBLIC_PLANS,
  planFor,
} from "@shared/plans";
import { and, count, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  billingEvents,
  importBatch,
  invitation,
  member,
  pendingCheckouts,
  sale,
  subscriptions,
} from "../../db/schema";
import { AppError, badRequest, paymentRequired } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";

type SubscriptionRow = typeof subscriptions.$inferSelect;

export interface OrgPlan {
  /** The plan whose limits apply now (Free when the subscription is missing or lapsed). */
  plan: Plan;
  entitlement: Entitlement<Plan>;
  subscription: SubscriptionRow | null;
}

const billingUnavailable = () =>
  new AppError(503, "billing_unavailable", "Paid plans are not available yet on this deployment");

export async function getSubscription(ctx: Pick<AppContext, "db">, orgId: string) {
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

/** "YYYY-MM" of a Date in UTC. */
export const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/** The 12 months ending with `now`'s month, oldest first ("YYYY-MM"). */
function last12Months(now: Date): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    out.push(monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

/** Platforms this org has imported from (an import row, even with no sales, counts). */
export async function platformsUsed(ctx: AppContext, orgId: string): Promise<string[]> {
  const rows = await ctx.db
    .selectDistinct({ platform: importBatch.platform })
    .from(importBatch)
    .where(eq(importBatch.orgId, orgId));
  return rows.map((r) => r.platform).sort();
}

/** Orders per sale-date month, for the months given. */
async function ordersByMonth(ctx: AppContext, orgId: string, months: readonly string[]) {
  if (months.length === 0) return new Map<string, number>();
  const month = sql<string>`substr(${sale.date}, 1, 7)`;
  const rows = await ctx.db
    .select({ month, n: count() })
    .from(sale)
    .where(and(eq(sale.orgId, orgId), eq(sale.kind, "order"), inArray(month, [...months])))
    .groupBy(month);
  return new Map(rows.map((r) => [r.month, r.n]));
}

export async function usage(ctx: AppContext, orgId: string) {
  const now = ctx.now();
  const months = last12Months(now);
  const [platforms, members, byMonth] = await Promise.all([
    platformsUsed(ctx, orgId),
    ctx.db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)).get(),
    ordersByMonth(ctx, orgId, months),
  ]);
  let busiestMonth: { month: string; orders: number } | null = null;
  for (const m of months) {
    const n = byMonth.get(m) ?? 0;
    if (n > 0 && (!busiestMonth || n >= busiestMonth.orders))
      busiestMonth = { month: m, orders: n };
  }
  return {
    platforms,
    members: members?.n ?? 0,
    ordersThisMonth: byMonth.get(monthOf(now)) ?? 0,
    busiestMonth,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const platformName = (p: string) => PLATFORM_LABELS[p as Platform] ?? p;

/**
 * Before an import is written: a platform the plan has no room for, and (free plan only) a month
 * the import would take over the order cap. `newOrderDates` are the sale dates (YYYY-MM-DD) of the
 * orders the import would add, after duplicates are dropped.
 */
export async function assertImportAllowed(
  ctx: AppContext,
  orgId: string,
  platform: string,
  newOrderDates: readonly string[],
) {
  const { plan } = await orgPlan(ctx, orgId);
  if (plan.maxPlatforms !== null) {
    const used = await platformsUsed(ctx, orgId);
    if (!used.includes(platform) && used.length >= plan.maxPlatforms) {
      throw paymentRequired(
        `The ${plan.name} plan covers ${plural(plan.maxPlatforms, "platform")} and this shop already imports from ${used.map(platformName).join(" and ")}. Upgrade on the Billing page to add ${platformName(platform)}, or delete an import you no longer need. Nothing already imported is touched.`,
      );
    }
  }
  if (!plan.hardOrderCap || plan.ordersPerMonth === null || newOrderDates.length === 0) return;
  const adding = new Map<string, number>();
  for (const d of newOrderDates) adding.set(d.slice(0, 7), (adding.get(d.slice(0, 7)) ?? 0) + 1);
  const have = await ordersByMonth(ctx, orgId, [...adding.keys()]);
  const over = [...adding.entries()]
    .map(([month, n]) => ({ month, total: (have.get(month) ?? 0) + n }))
    .filter((m) => m.total > (plan.ordersPerMonth as number))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (over.length > 0) {
    const first = over[0] as { month: string; total: number };
    const more = over.length > 1 ? ` (and ${plural(over.length - 1, "other month")})` : "";
    throw paymentRequired(
      `The ${plan.name} plan holds ${plural(plan.ordersPerMonth, "order")} a month, and this report would bring ${first.month} to ${first.total}${more}. Nothing was imported. Upgrade on the Billing page (paid plans never block a busy month), or import a shorter date range.`,
    );
  }
}

/** Before a member is invited or joins: the plan's seats (pending invitations count when inviting). */
export async function assertSeat(
  ctx: AppContext,
  orgId: string,
  { countPending }: { countPending: boolean },
) {
  const { plan } = await orgPlan(ctx, orgId);
  if (plan.maxMembers === null) return;
  const [members, pending] = await Promise.all([
    ctx.db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)).get(),
    countPending
      ? ctx.db
          .select({ n: count() })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, orgId),
              eq(invitation.status, "pending"),
              gte(invitation.expiresAt, ctx.now()),
            ),
          )
          .get()
      : Promise.resolve({ n: 0 }),
  ]);
  if ((members?.n ?? 0) + (pending?.n ?? 0) >= plan.maxMembers) {
    throw paymentRequired(
      plan.maxMembers === 1
        ? `The ${plan.name} plan is for one person. The Business plan adds up to 3 users (a helper, your bookkeeper or tax preparer); upgrade on the Billing page.`
        : `The ${plan.name} plan includes ${plural(plan.maxMembers, "user")}${countPending ? ", counting pending invitations" : ""}. Remove a member or revoke an invitation, or upgrade on the Billing page.`,
    );
  }
}

export async function billingSummary(ctx: AppContext, orgId: string): Promise<BillingDto> {
  const [{ plan, entitlement, subscription }, used] = await Promise.all([
    orgPlan(ctx, orgId),
    usage(ctx, orgId),
  ]);
  const fits = planFor(
    Math.max(used.busiestMonth?.orders ?? 0, used.ordersThisMonth),
    used.platforms.length,
  );
  const outgrown =
    (plan.ordersPerMonth !== null &&
      Math.max(used.busiestMonth?.orders ?? 0, used.ordersThisMonth) > plan.ordersPerMonth) ||
    (plan.maxPlatforms !== null && used.platforms.length > plan.maxPlatforms);
  return {
    plan: { key: plan.key, name: plan.name },
    status: entitlement.status,
    lapsed: subscription !== null && !entitlement.active,
    graceUntil: entitlement.graceUntil?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    limits: {
      platforms: plan.maxPlatforms,
      members: plan.maxMembers,
      ordersPerMonth: plan.ordersPerMonth,
      hardOrderCap: plan.hardOrderCap,
    },
    usage: used,
    // Only when the seller has outgrown the current plan, and only toward a bigger one.
    suggestedPlan: outgrown && fits && fits.priceCents > plan.priceCents ? fits.key : null,
    checkoutAvailable: ctx.billing !== null,
    portalAvailable: ctx.billing !== null && Boolean(subscription?.providerCustomerId),
    plans: PUBLIC_PLANS.map(publicPlan),
  };
}

export const publicPlan = (p: Plan): PlanDto => ({
  key: p.key,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  annualPriceCents: p.annualPriceCents,
  maxPlatforms: p.maxPlatforms,
  maxMembers: p.maxMembers,
  ordersPerMonth: p.ordersPerMonth,
  hardOrderCap: p.hardOrderCap,
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
  if (!plan?.purchasable) throw badRequest("Unknown plan");
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
  const page = `/o/${encodeURIComponent(tenant.orgId)}/billing`;
  const back = (q: string) => new URL(`${page}?${q}`, base).toString();
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
  const returnUrl = new URL(`/o/${encodeURIComponent(orgId)}/billing`, ctx.env.APP_URL).toString();
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

  // 5. Write.
  const values = {
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
  return finish({ outcome: "applied" }, orgId);
}
