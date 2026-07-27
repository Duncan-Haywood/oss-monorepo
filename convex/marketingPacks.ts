import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";

const variantValidator = v.object({
  contentType: v.string(),
  title: v.optional(v.string()),
  body: v.string(),
  cta: v.optional(v.string()),
  hashtags: v.optional(v.array(v.string())),
  scheduledFor: v.optional(v.string()),
});

const packReturn = v.object({
  id: v.string(),
  leadSlug: v.string(),
  yearMonth: v.string(),
  variants: v.array(variantValidator),
  generatedAt: v.string(),
  generator: v.union(v.literal("stub"), v.literal("anthropic")),
  packageTier: v.optional(v.string()),
  sentToClientAt: v.optional(v.string()),
});

export const upsert = mutation({
  args: {
    packId: v.string(),
    leadSlug: v.string(),
    yearMonth: v.string(),
    variants: v.array(variantValidator),
    generatedAt: v.string(),
    generator: v.union(v.literal("stub"), v.literal("anthropic")),
    packageTier: v.optional(v.string()),
    apiSecret: v.string(),
  },
  returns: packReturn,
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Compound index typing needs a generated DataModel; with generic ctx,
    // chain only the first indexed field then match yearMonth in TS.
    const candidates = await ctx.db
      .query("marketingPacks")
      .withIndex("by_lead_month", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    const existing = candidates.find((row) => row.yearMonth === args.yearMonth);

    // Regenerating always clears sentToClientAt (undefined unsets a Convex
    // field on patch) — new pack content has not yet been sent, even if the
    // prior month's/version's pack was (marketing-voice-pack-client-send-visibility).
    if (existing) {
      await ctx.db.patch(existing._id, {
        packId: args.packId,
        variants: args.variants,
        generatedAt: args.generatedAt,
        generator: args.generator,
        packageTier: args.packageTier,
        sentToClientAt: undefined,
      });
    } else {
      await ctx.db.insert("marketingPacks", {
        packId: args.packId,
        leadSlug: args.leadSlug,
        yearMonth: args.yearMonth,
        variants: args.variants,
        generatedAt: args.generatedAt,
        generator: args.generator,
        packageTier: args.packageTier,
      });
    }

    return {
      id: args.packId,
      leadSlug: args.leadSlug,
      yearMonth: args.yearMonth,
      variants: args.variants,
      generatedAt: args.generatedAt,
      generator: args.generator,
      packageTier: args.packageTier,
    };
  },
});

/**
 * Durable sent-marker after sendMarketingPackToClientEmail resolves
 * { success: true }. Returns whether the row was actually marked — re-checks
 * sentToClientAt IS unset atomically with the write, mirroring
 * commerceOrders.markClientReceiptSent (see
 * marketing-voice-pack-client-send-visibility).
 */
export const markSentToClient = mutation({
  args: {
    leadSlug: v.string(),
    yearMonth: v.string(),
    sentToClientAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const candidates = await ctx.db
      .query("marketingPacks")
      .withIndex("by_lead_month", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    const existing = candidates.find((row) => row.yearMonth === args.yearMonth);
    if (!existing || existing.sentToClientAt) {
      return false;
    }
    await ctx.db.patch(existing._id, { sentToClientAt: args.sentToClientAt });
    return true;
  },
});

/**
 * Releases a reservation made by markSentToClient when the send that
 * reservation was guarding turned out to fail — see
 * marketing-voice-pack-client-send-race-guard-ordering-fix. Only clears the
 * marker when it still holds the exact value this caller itself just wrote
 * (expectedSentToClientAt); if it has since changed — a regenerate already
 * cleared it, or (impossible under the reserve-before-send ordering, but
 * checked anyway) a different value was written — this is a safe no-op
 * rather than clobbering someone else's state.
 */
export const clearSentToClient = mutation({
  args: {
    leadSlug: v.string(),
    yearMonth: v.string(),
    expectedSentToClientAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const candidates = await ctx.db
      .query("marketingPacks")
      .withIndex("by_lead_month", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    const existing = candidates.find((row) => row.yearMonth === args.yearMonth);
    if (!existing || existing.sentToClientAt !== args.expectedSentToClientAt) {
      return false;
    }
    await ctx.db.patch(existing._id, { sentToClientAt: undefined });
    return true;
  },
});

export const getByLeadMonth = query({
  args: {
    leadSlug: v.string(),
    yearMonth: v.string(),
    apiSecret: v.string(),
  },
  returns: v.union(packReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const candidates = await ctx.db
      .query("marketingPacks")
      .withIndex("by_lead_month", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    const row = candidates.find((r) => r.yearMonth === args.yearMonth);
    if (!row) return null;
    return {
      id: row.packId,
      leadSlug: row.leadSlug,
      yearMonth: row.yearMonth,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
      packageTier: row.packageTier,
      sentToClientAt: row.sentToClientAt,
    };
  },
});

/**
 * Every marketing pack for a UTC month — used by listMarketingPacksDue /
 * pipeline-health / digest. Must not cap at newest N: absence-from-page is
 * treated as "pack missing", so a truncated page invents false Generate debt.
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export const listByMonth = query({
  args: {
    yearMonth: v.string(),
    limit: v.optional(v.number()),
    apiSecret: v.string(),
  },
  returns: v.array(packReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    void args.limit;
    const rows = await ctx.db
      .query("marketingPacks")
      .withIndex("by_month", (q) => q.eq("yearMonth", args.yearMonth))
      .collect();
    // Newest-first to match SQLite ORDER BY generatedAt DESC.
    rows.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return rows.map((row) => ({
      id: row.packId,
      leadSlug: row.leadSlug,
      yearMonth: row.yearMonth,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
      packageTier: row.packageTier,
      sentToClientAt: row.sentToClientAt,
    }));
  },
});
