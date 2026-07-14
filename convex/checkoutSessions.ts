import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    leadSlug: v.string(),
    stripeSessionId: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    customerEmail: v.optional(v.string()),
    createdAt: v.string(),
    kind: v.optional(v.union(v.literal("bundle"), v.literal("commerce_sku"))),
    skuId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (existing) return null;
    await ctx.db.insert("checkoutSessions", { ...args, status: "open" });
    return null;
  },
});

export const markComplete = mutation({
  args: { stripeSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { status: "complete" });
    }
    return null;
  },
});

export const recordRecoverySent = mutation({
  args: { stripeSessionId: v.string(), sentAt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { recoverySentAt: args.sentAt });
    }
    return null;
  },
});

export const listOpen = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    // Match the SQLite fallback (ORDER BY createdAt ASC). The by_status index
    // has no createdAt sort field, so sort on the app createdAt (ISO string)
    // here — abandoned-recovery processes the oldest open carts first so the
    // longest-unrecovered (most urgent) sessions are prioritized. See
    // convex-query-ordering-parity in /docs/process.
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
});
