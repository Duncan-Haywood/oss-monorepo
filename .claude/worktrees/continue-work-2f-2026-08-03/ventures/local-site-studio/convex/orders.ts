import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
  returns: v.array(
    v.object({
      _id: v.id("orders"),
      _creationTime: v.number(),
      leadSlug: v.string(),
      stripeSessionId: v.string(),
      stripeCustomerId: v.optional(v.string()),
      customerEmail: v.string(),
      tier: v.string(),
      commerceAddon: v.boolean(),
      amountTotal: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    // Newest-first by createdAt — matches SQLite ORDER BY createdAt DESC and
    // db.ts sortOrdersNewestFirst. Do not rely on .collect() insertion order;
    // Billing Portal latestEligibleOrder assumes newest row first.
    const rows = await ctx.db.query("orders").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getByStripeSessionId = query({
  args: { stripeSessionId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("orders"),
      _creationTime: v.number(),
      leadSlug: v.string(),
      stripeSessionId: v.string(),
      stripeCustomerId: v.optional(v.string()),
      customerEmail: v.string(),
      tier: v.string(),
      commerceAddon: v.boolean(),
      amountTotal: v.number(),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .unique();
  },
});
