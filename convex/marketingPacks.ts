import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
  },
  returns: packReturn,
  handler: async (ctx, args) => {
    // Compound index typing needs a generated DataModel; with generic ctx,
    // chain only the first indexed field then match yearMonth in TS.
    const candidates = await ctx.db
      .query("marketingPacks")
      .withIndex("by_lead_month", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    const existing = candidates.find((row) => row.yearMonth === args.yearMonth);

    if (existing) {
      await ctx.db.patch(existing._id, {
        packId: args.packId,
        variants: args.variants,
        generatedAt: args.generatedAt,
        generator: args.generator,
        packageTier: args.packageTier,
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

export const getByLeadMonth = query({
  args: {
    leadSlug: v.string(),
    yearMonth: v.string(),
  },
  returns: v.union(packReturn, v.null()),
  handler: async (ctx, args) => {
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
    };
  },
});

export const listByMonth = query({
  args: {
    yearMonth: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(packReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const rows = await ctx.db
      .query("marketingPacks")
      .withIndex("by_month", (q) => q.eq("yearMonth", args.yearMonth))
      .take(limit);
    return rows.map((row) => ({
      id: row.packId,
      leadSlug: row.leadSlug,
      yearMonth: row.yearMonth,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
      packageTier: row.packageTier,
    }));
  },
});
