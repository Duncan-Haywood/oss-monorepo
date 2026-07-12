import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const isSuppressed = query({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return !!existing;
  },
});

export const suppress = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) return null;
    await ctx.db.insert("suppressions", { email: args.email });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("suppressions").collect();
    return rows.map((r) => r.email);
  },
});
