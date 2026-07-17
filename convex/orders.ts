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
      await ctx.db.replace(row._id, {
        leadSlug: row.leadSlug,
        stripeSessionId: row.stripeSessionId,
        stripeCustomerId: row.stripeCustomerId,
        customerEmail: row.customerEmail,
        tier: row.tier,
        commerceAddon: row.commerceAddon,
        amountTotal: row.amountTotal,
        createdAt: row.createdAt,
      });
      updatedCount += 1;
    }
    return { updatedCount };
  },
});
