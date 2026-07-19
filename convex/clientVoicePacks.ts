import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";

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
    apiSecret: v.string(),
  },
  returns: packReturn,
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
    apiSecret: v.string(),
  },
  returns: v.union(packReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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

/**
 * Every client voice pack — used by listClientVoicePacksDue / pipeline-health /
 * digest. Must not cap at newest N: absence-from-page is treated as "pack
 * missing", so a truncated page invents false Generate voice debt.
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    apiSecret: v.string(),
  },
  returns: v.array(packReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    void args.limit;
    const rows = await ctx.db.query("clientVoicePacks").collect();
    // Newest-first to match SQLite ORDER BY generatedAt DESC.
    rows.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return rows.map((row) => ({
      id: row.packId,
      leadSlug: row.leadSlug,
      variants: row.variants,
      generatedAt: row.generatedAt,
      generator: row.generator as "stub" | "anthropic",
    }));
  },
});
