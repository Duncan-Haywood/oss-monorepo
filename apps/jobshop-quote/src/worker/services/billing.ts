// Billing: what a shop's plan allows, checkout and portal sessions, and the Paddle webhook.
// Pure rules live in packages/billing; this file owns storage. See docs/BILLING.md. Ported from
// apps/payapps (same webhook rules); the limits are this app's own: RFQs the AI reads per month,
// seats, and the plan's monthly AI ceiling.
//
// Org binding (security): a webhook event reaches a shop ONLY through
//   1. the subscription row that already holds the event's providerSubscriptionId, or
//   2. a valid, unexpired checkout token (custom_data.checkoutToken) that the first subscription
//      using it consumes atomically.
// Raw custom_data (orgId, planKey, ...) is never read, and the plan comes only from the billed price.
//
// Lapsed or missing subscriptions fall back to the free plan. Nothing is ever deleted or hidden:
// over the allowance, a shop keeps every RFQ, quote and PDF, can still enter parts by hand, price
// and send quotes; only the AI read of a new RFQ waits for next month or an upgrade.
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
import type { BillingDto } from "@shared/api";
import { filePages, PAGES_PER_RFQ, rfqUnitsForPages } from "@shared/pdf-pages";
import { COMP_PLAN, catalog, FREE_PLAN, type Plan, PUBLIC_PLANS } from "@shared/plans";
import { and, count, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import type { Db } from "../db/client";
import {
  billingEvents,
  invitation,
  member,
  pendingCheckouts,
  rfqCounts,
  rfqFiles,
  rfqs,
  subscriptions,
} from "../db/schema";
import { AppError, badRequest, notFound, paymentRequired } from "../lib/errors";
import { newId } from "../lib/ids";
import { isCadFile } from "../ports/geometry";
import type { Tenant } from "../types";

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

async function planFor(db: Db, orgId: string, now: Date): Promise<OrgPlan> {
  const subscription = await getSubscription({ db }, orgId);
  const entitlement = resolveEntitlement<Plan>(subscription, {
    getPlan: catalog.get,
    now,
    compPlan: COMP_PLAN,
  });
  const plan = entitlement.active && entitlement.plan ? entitlement.plan : FREE_PLAN;
  return { plan, entitlement, subscription };
}

export const orgPlan = (ctx: AppContext, orgId: string) => planFor(ctx.db, orgId, ctx.now());

/**
 * The shop's monthly AI ceiling for the LLM budget guard (services/guards/llm-budget.ts
 * `orgCapMicros`). Lives here so the plan, not a global default, bounds what one shop can spend.
 */
export async function planLlmCapMicros(db: Db, orgId: string, now: Date): Promise<number> {
  const { plan } = await planFor(db, orgId, now);
  return Math.round(plan.llmMonthlyCapUsd * 1_000_000);
}

/** RFQ allowances are per calendar month (UTC), the same month the AI ceiling uses. */
export const usagePeriodStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()));
const nextPeriodStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1));

export async function usage(ctx: AppContext, orgId: string) {
  const since = usagePeriodStart(ctx.now());
  const [read, members, invites] = await Promise.all([
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${rfqCounts.units}), 0)` })
      .from(rfqCounts)
      .where(and(eq(rfqCounts.orgId, orgId), gte(rfqCounts.countedAt, since)))
      .get(),
    ctx.db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)).get(),
    ctx.db
      .select({ n: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, ctx.now()),
        ),
      )
      .get(),
  ]);
  return {
    rfqsThisMonth: Number(read?.n ?? 0),
    members: members?.n ?? 0,
    pendingInvitations: invites?.n ?? 0,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const allowanceReached = (plan: Plan, now: Date, needed: number, left: number) =>
  paymentRequired(
    (needed > 1
      ? `Reading this RFQ needs ${plural(needed, "RFQ")} of this month's allowance (one per ${PAGES_PER_RFQ} drawing pages), and ${Math.max(0, left)} ${left === 1 ? "is" : "are"} left. `
      : "") +
      `The ${plan.name} plan includes ${plural(plan.rfqsPerMonth ?? 0, "RFQ")} a month for the AI to read` +
      (needed > 1 ? ". " : ", and this month's are used. ") +
      `It resets on ${nextPeriodStart(now).toISOString().slice(0, 10)} (UTC). You can still enter parts by hand and quote them, or upgrade on the Billing page.`,
  );

/** Drawing pages of an RFQ's files, and how many RFQs of the allowance that package uses. */
export async function rfqPackage(ctx: AppContext, orgId: string, rfqId: string) {
  const files = await ctx.db
    .select({
      fileName: rfqFiles.fileName,
      mimeType: rfqFiles.mimeType,
      pageCount: rfqFiles.pageCount,
    })
    .from(rfqFiles)
    .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfqId)))
    .all();
  const pages = files.reduce((n, f) => n + filePages({ ...f, isCad: isCadFile(f.fileName) }), 0);
  return { pages, units: rfqUnitsForPages(pages) };
}

/**
 * Count this RFQ against the month's allowance before the AI reads it: once per 10 drawing pages
 * (at least once), the pricing page's rule. One SQL statement records the claim only while the
 * shop has room for it and only if no other claim on this RFQ landed meanwhile, so two reads at
 * once cannot both take the last slot or both count the same pages. An RFQ already counted for
 * its pages is free to read again; one that gained pages since counts only the extra RFQs, in this
 * month. The returned `release` deletes the claim when the read fails, so a model error never
 * costs the shop anything.
 */
export async function claimRfqRead(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
): Promise<{ release: () => Promise<void>; units: number; pages: number }> {
  const row = await ctx.db
    .select({ countedAt: rfqs.countedAt })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId)))
    .get();
  if (!row) throw notFound("RFQ");
  const pkg = await rfqPackage(ctx, orgId, rfqId);
  const counted = async () =>
    Number(
      (
        await ctx.db
          .select({ n: sql<number>`coalesce(sum(${rfqCounts.units}), 0)` })
          .from(rfqCounts)
          .where(and(eq(rfqCounts.orgId, orgId), eq(rfqCounts.rfqId, rfqId)))
          .get()
      )?.n ?? 0,
    );
  const before = await counted();
  const noop = { release: async () => {}, units: 0, pages: pkg.pages };
  if (before >= pkg.units) return noop;
  const extra = pkg.units - before;

  const now = ctx.now();
  const { plan } = await orgPlan(ctx, orgId);
  const since = usagePeriodStart(now).getTime();
  const id = newId("rfc");
  const room =
    plan.rfqsPerMonth === null
      ? sql`1`
      : sql`(select coalesce(sum(c.units), 0) from ${rfqCounts} c where c.org_id = ${orgId} and c.counted_at >= ${since}) + ${extra} <= ${plan.rfqsPerMonth}`;
  const result = await ctx.db.run(
    sql`insert into ${rfqCounts} (id, org_id, rfq_id, units, pages, counted_at)
        select ${id}, ${orgId}, ${rfqId}, ${extra}, ${pkg.pages}, ${now.getTime()}
        where (select coalesce(sum(c.units), 0) from ${rfqCounts} c where c.org_id = ${orgId} and c.rfq_id = ${rfqId}) = ${before}
          and ${room}`,
  );
  if (result.meta.changes === 0) {
    // Lost a race with a concurrent read of this same RFQ: if that read counted these pages, this
    // one is free.
    if ((await counted()) >= pkg.units) return noop;
    const used = (await usage(ctx, orgId)).rfqsThisMonth;
    throw allowanceReached(plan, now, extra, (plan.rfqsPerMonth ?? 0) - used);
  }
  // The first count also stamps the RFQ (kept for the RFQ list and older readers).
  const first = before === 0 && !row.countedAt;
  if (first) {
    await ctx.db
      .update(rfqs)
      .set({ countedAt: now })
      .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId), isNull(rfqs.countedAt)));
  }
  return {
    units: extra,
    pages: pkg.pages,
    release: async () => {
      await ctx.db.delete(rfqCounts).where(and(eq(rfqCounts.id, id), eq(rfqCounts.orgId, orgId)));
      if (first) {
        await ctx.db
          .update(rfqs)
          .set({ countedAt: null })
          .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId), eq(rfqs.countedAt, now)));
      }
    },
  };
}

/** Before an invitation: members plus open invitations must stay within the plan's seats. */
export async function assertCanInvite(ctx: AppContext, orgId: string) {
  const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
  if (plan.maxMembers !== null && used.members + used.pendingInvitations >= plan.maxMembers) {
    throw paymentRequired(
      `The ${plan.name} plan includes ${plural(plan.maxMembers, "user")} (members and open invitations count). Revoke an invitation, remove a member or upgrade on the Billing page.`,
    );
  }
}

/** Before an invitation is accepted (the plan may have changed since it was sent). */
export async function assertSeatForNewMember(ctx: AppContext, orgId: string) {
  const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
  if (plan.maxMembers !== null && used.members >= plan.maxMembers) {
    throw paymentRequired(
      `This shop's ${plan.name} plan has no free seat. Ask an admin to upgrade on the Billing page.`,
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
    limits: { rfqsPerMonth: plan.rfqsPerMonth, members: plan.maxMembers },
    usage: {
      rfqsThisMonth: used.rfqsThisMonth,
      members: used.members,
      pendingInvitations: used.pendingInvitations,
    },
    allowanceResetsOn: nextPeriodStart(ctx.now()).toISOString().slice(0, 10),
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
  rfqsPerMonth: p.rfqsPerMonth,
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
  const back = (q: string) => new URL(`/app/${tenant.orgId}/billing?${q}`, base).toString();
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
  if (!sub?.providerCustomerId) throw badRequest("This shop has no paid subscription");
  const returnUrl = new URL(`/app/${orgId}/billing`, ctx.env.APP_URL).toString();
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
