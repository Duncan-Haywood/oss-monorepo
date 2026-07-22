import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";

export const isSuppressed = query({
  args: { email: v.string(), apiSecret: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return !!existing;
  },
});

export const suppress = mutation({
  args: { email: v.string(), apiSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
  args: { apiSecret: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db.query("suppressions").collect();
    return rows.map((r) => r.email);
  },
});

/**
 * Operator override: remove an address from the CAN-SPAM opt-out list.
 * Returns whether a row was actually deleted so the caller (db.ts's
 * unsuppressEmail) can distinguish "removed" from "was never suppressed" —
 * the dashboard action does its own existence check first via
 * isEmailSuppressed, but this stays defensive against a race between that
 * check and this write.
 */
export const unsuppress = mutation({
  args: { email: v.string(), apiSecret: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!existing) return false;
    await ctx.db.delete(existing._id);
    return true;
  },
});
