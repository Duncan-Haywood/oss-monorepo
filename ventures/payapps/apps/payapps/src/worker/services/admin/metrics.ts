// Cross-tenant METADATA for the platform admin API (routes/admin.ts): counts, plan, status, the
// recorded Paddle price, and the org owner's name and email. Tenant content (jobs, pay apps,
// waivers, attachments) is never selected here. Numbers this app does not measure are null.
import {
  ADMIN_CONTRACT_VERSION,
  type AdminAccountDto,
  type AdminAccountList,
  type AdminAccountsPage,
  dayBuckets,
  monthlyRecurringMinor,
  type ProductAdminMetrics,
  summarizeMrr,
  weekBuckets,
  weekStart,
  windowStart,
} from "@admin-metrics";
import { catalog } from "@shared/plans";
import { and, count, desc, eq, gte, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { billingEvents, member, organization, session, subscriptions, user } from "../../db/schema";
import { activationFunnel } from "./activation";
import { signupSourceCounts } from "./sources";

export const PRODUCT = { key: "payapps", name: "PayApps" } as const;

const DAY_MS = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function productMetrics(
  ctx: AppContext,
  windowDays: number,
): Promise<ProductAdminMetrics> {
  const { db } = ctx;
  const now = ctx.now();
  const since = windowStart(now, windowDays);
  const weeks = Math.max(1, Math.ceil(windowDays / 7));
  const weekSince = new Date(weekStart(now).getTime() - (weeks - 1) * 7 * DAY_MS);
  const seriesSince = weekSince < since ? weekSince : since;

  const [
    users,
    verifiedUsers,
    recentUsers,
    orgs,
    activeOrgs,
    subs,
    trialsInWindow,
    converted,
    expired,
    canceledInWindow,
    failed,
    anyTransactionEvent,
    activation,
    sources,
  ] = await Promise.all([
    db.select({ n: count() }).from(user).get(),
    db.select({ n: count() }).from(user).where(eq(user.emailVerified, true)).get(),
    db
      .select({ at: user.createdAt, verified: user.emailVerified })
      .from(user)
      .where(gte(user.createdAt, seriesSince))
      .all(),
    db.select({ n: count() }).from(organization).get(),
    // Active = at least one member had a session that was created or refreshed inside the window.
    db
      .select({ n: sql<number>`count(distinct ${member.organizationId})`.mapWith(Number) })
      .from(member)
      .innerJoin(session, eq(session.userId, member.userId))
      .where(gte(session.updatedAt, since))
      .get(),
    db
      .select({
        planKey: subscriptions.planKey,
        status: subscriptions.status,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        priceAmountMinor: subscriptions.priceAmountMinor,
        priceCurrency: subscriptions.priceCurrency,
        billingInterval: subscriptions.billingInterval,
        billingFrequency: subscriptions.billingFrequency,
        priceQuantity: subscriptions.priceQuantity,
        priceDiscounted: subscriptions.priceDiscounted,
      })
      .from(subscriptions)
      .all(),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(gte(subscriptions.trialStartedAt, since))
      .get(),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(and(isNotNull(subscriptions.trialStartedAt), isNotNull(subscriptions.firstPaidAt)))
      .get(),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(
        and(
          isNotNull(subscriptions.trialStartedAt),
          sql`${subscriptions.firstPaidAt} is null`,
          eq(subscriptions.status, "canceled"),
        ),
      )
      .get(),
    db.select({ n: count() }).from(subscriptions).where(gte(subscriptions.canceledAt, since)).get(),
    db
      .select({ n: count() })
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.type, "transaction.payment_failed"),
          gte(billingEvents.createdAt, since),
        ),
      )
      .get(),
    db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(like(billingEvents.type, "transaction.%"))
      .limit(1)
      .get(),
    activationFunnel(ctx, since, windowDays),
    signupSourceCounts(ctx, since),
  ]);

  const byPlan = new Map<string, { planKey: string; status: string; count: number }>();
  for (const s of subs) {
    const k = `${s.planKey}\u0000${s.status}`;
    const row = byPlan.get(k) ?? { planKey: s.planKey, status: s.status, count: 0 };
    row.count++;
    byPlan.set(k, row);
  }
  const paidRows = subs.filter(
    (s) => (s.status === "active" || s.status === "past_due") && catalog.isPurchasable(s.planKey),
  );
  const stamps = recentUsers.map((u) => ({ at: u.at, verified: u.verified }));
  const byDay = dayBuckets(stamps, now, windowDays);
  const total = users?.n ?? 0;
  const verified = verifiedUsers?.n ?? 0;

  return {
    contractVersion: ADMIN_CONTRACT_VERSION,
    kind: "app",
    product: PRODUCT.key,
    productName: PRODUCT.name,
    generatedAt: now.toISOString(),
    windowDays,
    signups: {
      total,
      verified,
      unverified: total - verified,
      lastWindow: byDay.reduce((n, d) => n + d.total, 0),
      byDay,
      byWeek: weekBuckets(stamps, now, weeks),
    },
    orgs: {
      total: orgs?.n ?? 0,
      active: activeOrgs?.n ?? 0,
      activeDefinition: `A member signed in or refreshed a session in the last ${windowDays} days`,
    },
    trials: {
      current: subs.filter((s) => s.status === "trialing").length,
      startedInWindow: trialsInWindow?.n ?? 0,
      converted: converted?.n ?? 0,
      expired: expired?.n ?? 0,
      note: "Counted from the trial, first-payment and cancel times recorded by Paddle webhooks since admin metrics shipped",
    },
    subscriptions: {
      byPlan: [...byPlan.values()].sort((a, b) => b.count - a.count),
      paid: paidRows.length,
    },
    mrr: summarizeMrr(paidRows),
    cancellations: {
      inWindow: canceledInWindow?.n ?? 0,
      scheduled: paidRows.filter((s) => s.cancelAtPeriodEnd).length,
    },
    failedPayments: {
      // Without any transaction.* event on record the destination is not sending them: unmeasured.
      inWindow: anyTransactionEvent ? (failed?.n ?? 0) : null,
      pastDueNow: subs.filter((s) => s.status === "past_due").length,
    },
    // PayApps makes no LLM calls.
    llmSpend: null,
    activation,
    sources,
  };
}

export async function accountList(
  ctx: AppContext,
  list: AdminAccountList,
  limit: number,
): Promise<AdminAccountsPage> {
  const { db } = ctx;
  const now = ctx.now();
  const base = db
    .select({
      orgId: organization.id,
      orgName: organization.name,
      createdAt: organization.createdAt,
      planKey: subscriptions.planKey,
      status: subscriptions.status,
      trialStartedAt: subscriptions.trialStartedAt,
      firstPaidAt: subscriptions.firstPaidAt,
      canceledAt: subscriptions.canceledAt,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      updatedAt: subscriptions.updatedAt,
      priceAmountMinor: subscriptions.priceAmountMinor,
      priceCurrency: subscriptions.priceCurrency,
      billingInterval: subscriptions.billingInterval,
      billingFrequency: subscriptions.billingFrequency,
      priceQuantity: subscriptions.priceQuantity,
      priceDiscounted: subscriptions.priceDiscounted,
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.orgId, organization.id));

  const rows =
    list === "recent"
      ? await base.orderBy(desc(organization.createdAt), desc(organization.id)).limit(limit).all()
      : list === "trials"
        ? await base
            .where(
              or(
                eq(subscriptions.status, "trialing"),
                gte(subscriptions.trialStartedAt, new Date(now.getTime() - 90 * DAY_MS)),
              ),
            )
            .orderBy(desc(subscriptions.trialStartedAt), desc(organization.createdAt))
            .limit(limit)
            .all()
        : await base
            .where(
              or(
                inArray(subscriptions.status, ["canceled", "past_due"]),
                eq(subscriptions.cancelAtPeriodEnd, true),
              ),
            )
            .orderBy(desc(sql`coalesce(${subscriptions.canceledAt}, ${subscriptions.updatedAt})`))
            .limit(limit)
            .all();

  // The org's owner (earliest owner membership): name + email only.
  const owners = rows.length
    ? await db
        .select({
          orgId: member.organizationId,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          joined: member.createdAt,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            inArray(
              member.organizationId,
              rows.map((r) => r.orgId),
            ),
            eq(member.role, "owner"),
          ),
        )
        .orderBy(member.createdAt)
        .all()
    : [];
  const ownerOf = new Map<string, (typeof owners)[number]>();
  for (const o of owners) if (!ownerOf.has(o.orgId)) ownerOf.set(o.orgId, o);

  const items: AdminAccountDto[] = rows.map((r) => {
    const o = ownerOf.get(r.orgId);
    const paid = r.status === "active" || r.status === "past_due";
    return {
      orgId: r.orgId,
      orgName: r.orgName,
      createdAt: r.createdAt.toISOString(),
      owner: o ? { name: o.name, email: o.email, emailVerified: o.emailVerified } : null,
      planKey: r.planKey,
      status: r.status,
      trialStartedAt: iso(r.trialStartedAt),
      firstPaidAt: iso(r.firstPaidAt),
      canceledAt: iso(r.canceledAt),
      cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: iso(r.currentPeriodEnd),
      mrr: paid
        ? monthlyRecurringMinor({
            priceAmountMinor: r.priceAmountMinor,
            priceCurrency: r.priceCurrency,
            billingInterval: r.billingInterval,
            billingFrequency: r.billingFrequency,
            priceQuantity: r.priceQuantity,
            priceDiscounted: r.priceDiscounted,
          })
        : null,
    };
  });
  return {
    contractVersion: ADMIN_CONTRACT_VERSION,
    kind: "app",
    product: PRODUCT.key,
    list,
    items,
    limit,
  };
}
