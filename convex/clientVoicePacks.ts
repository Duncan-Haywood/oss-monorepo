import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const variantValidator = v.object({
  scriptType: v.string(),
  title: v.string(),
  body: v.string(),
  cta: v.optional(v.string()),
});

const packReturn = v.object({
  id: v.string(),
  leadSlug: v.string(),
  variants: v.array(variantValidator),
  generatedAt: v.string(),
  generator: v.union(v.literal("stub"), v.literal("anthropic")),
});

export const upsert = mutation({
  args: {
    packId: v.string(),
    leadSlug: v.string(),
    variants: v.array(variantValidator),
    generatedAt: v.string(),
    generator: v.union(v.literal("stub"), v.literal("anthropic")),
  },
  returns: packReturn,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientVoicePacks")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        packId: args.packId,
        variants: args.variants,
        generatedAt: args.generatedAt,
        generator: args.generator,
      });
    } else {
      await ctx.db.insert("clientVoicePacks", {
        packId: args.packId,
        leadSlug: args.leadSlug,
        variants: args.variants,
        generatedAt: args.generatedAt,
        generator: args.generator,
      });
    }

    return {
      id: args.packId,
      leadSlug: args.leadSlug,
      variants: args.variants,
      generatedAt: args.generatedAt,
      generator: args.generator,
    };
  },
});

export const getByLeadSlug = query({
  args: {
    leadSlug: v.string(),
  },
  returns: v.union(packReturn, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("clientVoicePacks")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!row) return null;
    return {
      id: row.packId,
      leadSlug: row.leadSlug,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
    };
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(packReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const rows = await ctx.db.query("clientVoicePacks").take(limit);
    return rows.map((row) => ({
      id: row.packId,
      leadSlug: row.leadSlug,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
    }));
  },
});
