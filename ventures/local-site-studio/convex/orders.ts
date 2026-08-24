import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  orderGrantsSoldCapabilityEntitlement,
  orderHadRecurringEntitlement,
} from "../src/lib/orders/recurring";
import { requireApiSecret } from "./lib/apiSecret";

const orderDocValidator = v.object({
  _id: v.id("orders"),
  _creationTime: v.number(),
  leadSlug: v.string(),
  stripeSessionId: v.string(),
  stripeCustomerId: v.optional(v.string()),
  customerEmail: v.string(),
  tier: v.string(),
  commerceAddon: v.boolean(),
  recurringCanceledAt: v.optional(v.number()),
  amountTotal: v.number(),
  createdAt: v.number(),
  refundedAt: v.optional(v.string()),
  disputedAt: v.optional(v.string()),
  lifetimeRevenueUsd: v.optional(v.number()),
  lastRenewalInvoiceId: v.optional(v.string()),
  lastBillingNoticeSendFailedAt: v.optional(v.number()),
  lastBillingNoticeSendFailedType: v.optional(v.string()),
  acquisitionSource: v.optional(v.string()),
});

const billingNoticeTypeValidator = v.union(
  v.literal("payment_failed"),
  v.literal("payment_recovered"),
  v.literal("subscription_paused"),
  v.literal("subscription_resumed"),
  v.literal("subscription_canceled"),
);

export const createOrder = mutation({
  args: {
    leadSlug: v.string(),
    tier: v.union(
      v.literal("starter"),
      v.literal("growth"),
      v.literal("complete")
    ),
    commerceAddon: v.boolean(),
    stripeSessionId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    amountTotal: v.float64(),
    customerEmail: v.string(),
    apiSecret: v.string(),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const { apiSecret, ...order } = args;
    void apiSecret;
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", order.stripeSessionId)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("orders", {
      ...order,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { apiSecret: v.string() },
  returns: v.array(orderDocValidator),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Newest-first by createdAt — matches SQLite ORDER BY createdAt DESC and
    // db.ts sortOrdersNewestFirst. Do not rely on .collect() insertion order;
    // Billing Portal latestEligibleOrder assumes newest row first.
    const rows = await ctx.db.query("orders").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Slug-scoped twin of `list` for public preview commerce eligibility.
 * Uses by_leadSlug so cold outreach previews never burn a full-ledger collect.
 * Newest-first by createdAt — matches SQLite WHERE + ORDER BY createdAt DESC.
 */
export const listByLeadSlug = query({
  args: { leadSlug: v.string(), apiSecret: v.string() },
  returns: v.array(orderDocValidator),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getByStripeSessionId = query({
  args: { stripeSessionId: v.string(), apiSecret: v.string() },
  returns: v.union(orderDocValidator, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    return await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
  },
});

/**
 * Orders for a Stripe Customer — powers the invoice.payment_failed dunning
 * notice (needs the order's leadSlug + stripeSessionId to look up the lead's
 * email and build a /checkout/success Manage-billing link). Newest-first,
 * matching list/listByLeadSlug.
 */
export const getByStripeCustomerId = query({
  args: { stripeCustomerId: v.string(), apiSecret: v.string() },
  returns: v.array(orderDocValidator),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Mark Growth/Complete/Commerce orders for a Stripe Customer as recurring-canceled.
 * Idempotent: rows that already have recurringCanceledAt are left unchanged.
 * Returns how many rows were newly patched (0 is success — unknown customer or
 * already synced).
 */
export const markRecurringCanceledByCustomer = mutation({
  args: {
    stripeCustomerId: v.string(),
    canceledAt: v.number(),
    apiSecret: v.string(),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const customerId = args.stripeCustomerId.trim();
    if (!customerId) {
      return { updatedCount: 0 };
    }
    const canceledAt =
      Number.isFinite(args.canceledAt) && args.canceledAt > 0
        ? args.canceledAt
        : Date.now();

    const rows = await ctx.db
      .query("orders")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
      .collect();

    let updatedCount = 0;
    for (const row of rows) {
      if (!orderHadRecurringEntitlement(row)) continue;
      if (
        typeof row.recurringCanceledAt === "number" &&
        Number.isFinite(row.recurringCanceledAt) &&
        row.recurringCanceledAt > 0
      ) {
        continue;
      }
      await ctx.db.patch(row._id, { recurringCanceledAt: canceledAt });
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

/**
 * Marks a single order recurring-canceled by its own stripeSessionId, never
 * by Stripe Customer id. Exists specifically for the recurring-upgrade
 * supersede path (stripe-checkout-recurring-upgrade-dedup): once
 * existingRecurringStripeCustomerId reuses a lead's existing Stripe Customer
 * for a tier-upgrade Checkout Session (the common case, not the exception),
 * the OLD order and the BRAND-NEW order share the same stripeCustomerId.
 * markRecurringCanceledByCustomer patches every row for that Customer id,
 * which would incorrectly also cancel the entitlement the customer just
 * paid for — this mutation targets only the one superseded order. Idempotent:
 * an already-canceled row is left unchanged. See
 * stripe-checkout-recurring-upgrade-dedup-shared-customer-fix.
 */
export const markRecurringCanceledBySessionId = mutation({
  args: {
    stripeSessionId: v.string(),
    canceledAt: v.number(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (!row || !orderHadRecurringEntitlement(row)) {
      return null;
    }
    if (
      typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
    ) {
      return null;
    }
    const canceledAt =
      Number.isFinite(args.canceledAt) && args.canceledAt > 0 ? args.canceledAt : Date.now();
    await ctx.db.patch(row._id, { recurringCanceledAt: canceledAt });
    return null;
  },
});

/**
 * Clear recurringCanceledAt on Growth/Complete/Commerce orders for a Stripe
 * Customer after subscription.created|updated reaches active|trialing.
 * Uses replace (not patch) so the optional field is omitted — matches SQLite
 * NULL overwrite. Idempotent: rows without a cancel timestamp are skipped.
 */
export const clearRecurringCanceledByCustomer = mutation({
  args: {
    stripeCustomerId: v.string(),
    apiSecret: v.string(),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const customerId = args.stripeCustomerId.trim();
    if (!customerId) {
      return { updatedCount: 0 };
    }

    const rows = await ctx.db
      .query("orders")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
      .collect();

    let updatedCount = 0;
    for (const row of rows) {
      if (!orderHadRecurringEntitlement(row)) continue;
      if (
        !(
          typeof row.recurringCanceledAt === "number" &&
          Number.isFinite(row.recurringCanceledAt) &&
          row.recurringCanceledAt > 0
        )
      ) {
        continue;
      }
      // Convex db.patch() actually removes a field when it's explicitly
      // undefined (see convex-patch-undefined-clear-semantics-correction in
      // business-decisions.ts) — replace with conditional spreads is used
      // here regardless, so every persisted optional is explicit at the call
      // site. Carry refundedAt / disputedAt forward untouched (this mutation
      // only clears the recurring-cancel pause; a refunded/disputed order
      // stays flagged on reactivate).
      await ctx.db.replace(row._id, {
        leadSlug: row.leadSlug,
        stripeSessionId: row.stripeSessionId,
        stripeCustomerId: row.stripeCustomerId,
        customerEmail: row.customerEmail,
        tier: row.tier,
        commerceAddon: row.commerceAddon,
        amountTotal: row.amountTotal,
        createdAt: row.createdAt,
        ...(row.refundedAt ? { refundedAt: row.refundedAt } : {}),
        ...(row.disputedAt ? { disputedAt: row.disputedAt } : {}),
        ...(typeof row.lifetimeRevenueUsd === "number"
          ? { lifetimeRevenueUsd: row.lifetimeRevenueUsd }
          : {}),
        ...(row.lastRenewalInvoiceId
          ? { lastRenewalInvoiceId: row.lastRenewalInvoiceId }
          : {}),
        ...(typeof row.lastBillingNoticeSendFailedAt === "number"
          ? { lastBillingNoticeSendFailedAt: row.lastBillingNoticeSendFailedAt }
          : {}),
        ...(row.lastBillingNoticeSendFailedType
          ? { lastBillingNoticeSendFailedType: row.lastBillingNoticeSendFailedType }
          : {}),
        ...(row.acquisitionSource ? { acquisitionSource: row.acquisitionSource } : {}),
      });
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

/**
 * Sync tier + commerceAddon on Growth/Complete/Commerce orders for a Stripe
 * Customer from the live Subscription's catalog monthly Prices. Idempotent —
 * rows already matching the target are skipped. Does not touch
 * recurringCanceledAt (clear/mark stay separate). amountTotal / stripeSessionId
 * stay historical.
 */
export const syncRecurringEntitlementByCustomer = mutation({
  args: {
    stripeCustomerId: v.string(),
    tier: v.union(
      v.literal("starter"),
      v.literal("growth"),
      v.literal("complete"),
    ),
    commerceAddon: v.boolean(),
    apiSecret: v.string(),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const customerId = args.stripeCustomerId.trim();
    if (!customerId) {
      return { updatedCount: 0 };
    }
    // Target must itself be a recurring-entitlement shape — refuse no-op
    // starter+false that would leave CRM with zero monthly unlock while still
    // clearing pause (callers gate on hasCatalogRecurring first).
    if (!orderHadRecurringEntitlement(args)) {
      return { updatedCount: 0 };
    }

    const rows = await ctx.db
      .query("orders")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
      .collect();

    let updatedCount = 0;
    for (const row of rows) {
      if (!orderHadRecurringEntitlement(row)) continue;
      if (row.tier === args.tier && row.commerceAddon === args.commerceAddon) {
        continue;
      }
      await ctx.db.patch(row._id, {
        tier: args.tier,
        commerceAddon: args.commerceAddon,
      });
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

/**
 * Flags a bundle order as refunded by Stripe (charge.refunded). Keyed on
 * stripeSessionId (unique) — mirrors commerceOrders.markRefunded. Idempotent:
 * a row that already has refundedAt is left unchanged (webhook redelivery).
 * See bundle-order-refund-tracking.
 */
export const markRefunded = mutation({
  args: {
    stripeSessionId: v.string(),
    refundedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (!row || row.refundedAt) {
      return null;
    }
    await ctx.db.patch(row._id, { refundedAt: args.refundedAt });
    return null;
  },
});

/**
 * Clears orders.refundedAt after refund.updated reports the refund that set
 * it (failed/canceled) never actually completed — funds never left the
 * platform. Uses replace with conditional spreads so the optional field is
 * explicitly omitted at the call site (db.patch() would also clear it when
 * passed undefined — see convex-patch-undefined-clear-semantics-correction in
 * business-decisions.ts — replace is a stylistic choice here, not a
 * workaround). Idempotent: already-clear rows are a no-op. Mirrors
 * commerceOrders.clearRefunded. See commerce-order-refund-reversal-tracking.
 */
export const clearRefunded = mutation({
  args: {
    stripeSessionId: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (!row || !row.refundedAt) {
      return null;
    }
    await ctx.db.replace(row._id, {
      leadSlug: row.leadSlug,
      stripeSessionId: row.stripeSessionId,
      stripeCustomerId: row.stripeCustomerId,
      customerEmail: row.customerEmail,
      tier: row.tier,
      commerceAddon: row.commerceAddon,
      amountTotal: row.amountTotal,
      createdAt: row.createdAt,
      ...(typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
        ? { recurringCanceledAt: row.recurringCanceledAt }
        : {}),
      ...(row.disputedAt ? { disputedAt: row.disputedAt } : {}),
      ...(typeof row.lifetimeRevenueUsd === "number"
        ? { lifetimeRevenueUsd: row.lifetimeRevenueUsd }
        : {}),
      ...(row.lastRenewalInvoiceId
        ? { lastRenewalInvoiceId: row.lastRenewalInvoiceId }
        : {}),
      ...(typeof row.lastBillingNoticeSendFailedAt === "number"
        ? { lastBillingNoticeSendFailedAt: row.lastBillingNoticeSendFailedAt }
        : {}),
      ...(row.lastBillingNoticeSendFailedType
        ? { lastBillingNoticeSendFailedType: row.lastBillingNoticeSendFailedType }
        : {}),
      ...(row.acquisitionSource ? { acquisitionSource: row.acquisitionSource } : {}),
    });
    return null;
  },
});

/**
 * Flags a bundle order as disputed by Stripe (charge.dispute.created, or
 * charge.dispute.closed with status lost when created was missed). Keyed on
 * stripeSessionId — mirrors commerceOrders.markDisputed. Idempotent: a row
 * that already has disputedAt is left unchanged. See
 * bundle-order-dispute-tracking.
 */
export const markDisputed = mutation({
  args: {
    stripeSessionId: v.string(),
    disputedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (!row || row.disputedAt) {
      return null;
    }
    await ctx.db.patch(row._id, { disputedAt: args.disputedAt });
    return null;
  },
});

/**
 * Clears orders.disputedAt after charge.dispute.closed with status won /
 * warning_closed — funds reinstated (or never permanently withdrawn). Uses
 * replace with conditional spreads so the optional field is explicitly
 * omitted at the call site (db.patch() would also clear it when passed
 * undefined — see convex-patch-undefined-clear-semantics-correction in
 * business-decisions.ts — replace is a stylistic choice here, not a
 * workaround). Idempotent: already-clear rows are a no-op. See
 * bundle-order-dispute-tracking.
 */
export const clearDisputed = mutation({
  args: {
    stripeSessionId: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (!row || !row.disputedAt) {
      return null;
    }
    await ctx.db.replace(row._id, {
      leadSlug: row.leadSlug,
      stripeSessionId: row.stripeSessionId,
      stripeCustomerId: row.stripeCustomerId,
      customerEmail: row.customerEmail,
      tier: row.tier,
      commerceAddon: row.commerceAddon,
      amountTotal: row.amountTotal,
      createdAt: row.createdAt,
      ...(typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
        ? { recurringCanceledAt: row.recurringCanceledAt }
        : {}),
      ...(row.refundedAt ? { refundedAt: row.refundedAt } : {}),
      ...(typeof row.lifetimeRevenueUsd === "number"
        ? { lifetimeRevenueUsd: row.lifetimeRevenueUsd }
        : {}),
      ...(row.lastRenewalInvoiceId
        ? { lastRenewalInvoiceId: row.lastRenewalInvoiceId }
        : {}),
      ...(typeof row.lastBillingNoticeSendFailedAt === "number"
        ? { lastBillingNoticeSendFailedAt: row.lastBillingNoticeSendFailedAt }
        : {}),
      ...(row.lastBillingNoticeSendFailedType
        ? { lastBillingNoticeSendFailedType: row.lastBillingNoticeSendFailedType }
        : {}),
      ...(row.acquisitionSource ? { acquisitionSource: row.acquisitionSource } : {}),
    });
    return null;
  },
});

/**
 * Adds a subscription-cycle renewal invoice's amount to a recurring order's
 * lifetime revenue total. Only ever applied to the customer's currently
 * sold-capability-entitled order (orderGrantsSoldCapabilityEntitlement) — a
 * canceled/refunded/disputed order must not accrue further recorded revenue.
 * Idempotent on invoiceId (Stripe redelivers invoice.paid): a row whose
 * lastRenewalInvoiceId already matches is left unchanged. See
 * revenue-total-usd-renewal-gap.
 */
export const recordSubscriptionRenewalPayment = mutation({
  args: {
    stripeCustomerId: v.string(),
    invoiceId: v.string(),
    amountUsd: v.number(),
    apiSecret: v.string(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const customerId = args.stripeCustomerId.trim();
    const invoiceId = args.invoiceId.trim();
    if (!customerId || !invoiceId || !(args.amountUsd > 0)) {
      return { recorded: false };
    }

    const rows = await ctx.db
      .query("orders")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
      .collect();
    const row = rows.find((r) => orderGrantsSoldCapabilityEntitlement(r));
    if (!row || row.lastRenewalInvoiceId === invoiceId) {
      return { recorded: false };
    }

    const base =
      typeof row.lifetimeRevenueUsd === "number" && Number.isFinite(row.lifetimeRevenueUsd)
        ? row.lifetimeRevenueUsd
        : row.amountTotal;
    await ctx.db.patch(row._id, {
      lifetimeRevenueUsd: base + args.amountUsd,
      lastRenewalInvoiceId: invoiceId,
    });
    return { recorded: true };
  },
});

/**
 * Records the outcome of a best-effort billing-notice send (dunning /
 * payment-recovered / subscription-paused / subscription-resumed —
 * src/app/api/stripe/webhook/route.ts) so a sustained Resend outage or a
 * persistently-bad customer email is visible to the operator (see
 * billing-notice-send-failure-visibility) instead of only reaching a server
 * log via console.warn. success:true clears any prior failure marker
 * (db.patch() with an explicit undefined removes the field — see
 * convex-patch-undefined-clear-semantics-correction in business-decisions.ts
 * — not a workaround, the documented mechanism); success:false records this
 * attempt. Never throws on a missing row — this is a display-only marker,
 * not a required write, and the caller's send is already best-effort.
 */
export const recordBillingNoticeSendOutcome = mutation({
  args: {
    stripeSessionId: v.string(),
    noticeType: billingNoticeTypeValidator,
    success: v.boolean(),
    atMs: v.number(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (!row) {
      return null;
    }
    if (args.success) {
      if (!row.lastBillingNoticeSendFailedAt) {
        return null;
      }
      await ctx.db.patch(row._id, {
        lastBillingNoticeSendFailedAt: undefined,
        lastBillingNoticeSendFailedType: undefined,
      });
      return null;
    }
    await ctx.db.patch(row._id, {
      lastBillingNoticeSendFailedAt: args.atMs,
      lastBillingNoticeSendFailedType: args.noticeType,
    });
    return null;
  },
});
