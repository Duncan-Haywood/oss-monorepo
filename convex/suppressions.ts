import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";
import { preferSuppressionReason, suppressionReasonOrDefault } from "../src/lib/email/suppression";

const suppressionReasonValidator = v.union(
  v.literal("unsubscribe"),
  v.literal("bounce"),
  v.literal("complaint"),
);

const suppressionReturn = v.object({
  email: v.string(),
  reason: v.optional(suppressionReasonValidator),
  createdAt: v.number(),
  reasonUpdatedAt: v.optional(v.number()),
});

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
  args: { email: v.string(), reason: suppressionReasonValidator, apiSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      // Compare against the *defaulted* existing reason, not the raw
      // (possibly-undefined) schema field — a row written before the
      // `reason` column existed has existing.reason === undefined, which
      // preferSuppressionReason also treats as "unsubscribe" internally.
      // Comparing the defaulted `preferred` value against the raw
      // `existing.reason` made every repeat suppress() call for a legacy
      // row (even a same-category unsubscribe) look like an "upgrade" —
      // "unsubscribe" !== undefined is always true — so it patched the row
      // and fabricated a reasonUpdatedAt timestamp on every single call,
      // never converging to a true no-op the way the SQLite fallback
      // (suppression_list.reason is NOT NULL DEFAULT 'unsubscribe', so its
      // existing.reason is never undefined) already does. See
      // suppression-legacy-row-idempotency-guard.
      const existingReason = suppressionReasonOrDefault(existing.reason);
      const preferred = preferSuppressionReason(existing.reason, args.reason);
      if (preferred !== existingReason) {
        await ctx.db.patch(existing._id, { reason: preferred, reasonUpdatedAt: Date.now() });
      }
      return null;
    }
    await ctx.db.insert("suppressions", { email: args.email, reason: args.reason });
    return null;
  },
});

export const list = query({
  args: { apiSecret: v.string() },
  returns: v.array(suppressionReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db.query("suppressions").collect();
    return rows.map((r) => ({
      email: r.email,
      reason: r.reason,
      createdAt: r._creationTime,
      reasonUpdatedAt: r.reasonUpdatedAt,
    }));
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
