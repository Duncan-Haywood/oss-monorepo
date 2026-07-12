import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const skuValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceCents: v.number(),
});

const catalogReturn = v.object({
  leadSlug: v.string(),
  items: v.array(skuValidator),
  updatedAt: v.string(),
});

export const upsert = mutation({
  args: {
    leadSlug: v.string(),
    items: v.array(skuValidator),
    updatedAt: v.string(),
  },
  returns: catalogReturn,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("commerceCatalogs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        items: args.items,
        updatedAt: args.updatedAt,
      });
    } else {
      await ctx.db.insert("commerceCatalogs", {
        leadSlug: args.leadSlug,
        items: args.items,
        updatedAt: args.updatedAt,
      });
    }

    return {
      leadSlug: args.leadSlug,
      items: args.items,
      updatedAt: args.updatedAt,
    };
  },
});

export const getByLeadSlug = query({
  args: { leadSlug: v.string() },
  returns: v.union(catalogReturn, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("commerceCatalogs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!row) return null;
    return {
      leadSlug: row.leadSlug,
      items: row.items,
      updatedAt: row.updatedAt,
    };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(catalogReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const rows = await ctx.db.query("commerceCatalogs").take(limit);
    return rows.map((row) => ({
      leadSlug: row.leadSlug,
      items: row.items,
      updatedAt: row.updatedAt,
    }));
  },
});
