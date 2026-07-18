import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
});

function orderHadRecurringEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
}): boolean {
  if (order.commerceAddon) return true;
  return order.tier === "growth" || order.tier === "complete";
}

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
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("orders", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  returns: v.array(orderDocValidator),
  handler: async (ctx) => {
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
  args: { leadSlug: v.string() },
  returns: v.array(orderDocValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getByStripeSessionId = query({
  args: { stripeSessionId: v.string() },
  returns: v.union(orderDocValidator, v.null()),
  handler: async (ctx, args) => {
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
  args: { stripeCustomerId: v.string() },
  returns: v.array(orderDocValidator),
  handler: async (ctx, args) => {
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
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
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
 * Clear recurringCanceledAt on Growth/Complete/Commerce orders for a Stripe
 * Customer after subscription.created|updated reaches active|trialing.
 * Uses replace (not patch) so the optional field is omitted — matches SQLite
 * NULL overwrite. Idempotent: rows without a cancel timestamp are skipped.
 */
export const clearRecurringCanceledByCustomer = mutation({
  args: {
    stripeCustomerId: v.string(),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
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
      // replace so omitted optionals clear — patch(undefined) would leave the field.
      // Carry refundedAt / disputedAt forward untouched (this mutation only
      // clears the recurring-cancel pause; a refunded/disputed order stays
      // flagged on reactivate).
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
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
 * replace so the optional field is omitted (patch(undefined) would leave it).
 * Idempotent: already-clear rows are a no-op. See bundle-order-dispute-tracking.
 */
export const clearDisputed = mutation({
  args: {
    stripeSessionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    });
    return null;
  },
});
