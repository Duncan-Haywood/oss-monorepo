import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const orderReturn = v.object({
  leadSlug: v.string(),
  skuId: v.string(),
  skuName: v.string(),
  amountPaidUsd: v.number(),
  stripeSessionId: v.string(),
  createdAt: v.string(),
  paidOutAt: v.optional(v.string()),
});

/**
 * Idempotent on stripeSessionId — Stripe may resend checkout.session.completed
 * for the same session, and the webhook must never double-count revenue.
 * Returns null (no insert) when a row for this session already exists.
 */
export const insert = mutation({
  args: {
    leadSlug: v.string(),
    skuId: v.string(),
    skuName: v.string(),
    amountPaidUsd: v.number(),
    stripeSessionId: v.string(),
    createdAt: v.string(),
  },
  returns: v.union(orderReturn, v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("commerceOrders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId),
      )
      .unique();
    if (existing) return null;

    await ctx.db.insert("commerceOrders", args);
    return args;
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(orderReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const rows = await ctx.db.query("commerceOrders").order("desc").take(limit);
    return rows.map((row) => ({
      leadSlug: row.leadSlug,
      skuId: row.skuId,
      skuName: row.skuName,
      amountPaidUsd: row.amountPaidUsd,
      stripeSessionId: row.stripeSessionId,
      createdAt: row.createdAt,
      paidOutAt: row.paidOutAt,
    }));
  },
});

/**
 * Marks a commerce order as manually paid out to the client. Keyed on
 * stripeSessionId (unique, always present) rather than the Convex row id —
 * matches the checkoutSessions mutation pattern (recordRecoverySent).
 */
export const markPaidOut = mutation({
  args: { stripeSessionId: v.string(), paidOutAt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("commerceOrders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId),
      )
      .unique();
    if (order) {
      await ctx.db.patch(order._id, { paidOutAt: args.paidOutAt });
    }
    return null;
  },
});
