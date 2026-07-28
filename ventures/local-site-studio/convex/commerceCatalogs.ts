import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const skuValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceCents: v.number(),
  stripeProductId: v.optional(v.string()),
  stripePriceId: v.optional(v.string()),
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

/**
 * Every commerce catalog — used by listCommerceCatalogsMissing /
 * listCommerceCatalogsUnsynced / pipeline-health / digest. Must not cap at
 * newest N: absence-from-page looks "missing" (false Generate debt) and an
 * unsynced catalog past the window looks synced (Buy now stays broken).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(catalogReturn),
  handler: async (ctx, args) => {
    void args.limit;
    const rows = await ctx.db.query("commerceCatalogs").collect();
    // Newest-first to match SQLite ORDER BY updatedAt DESC.
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows.map((row) => ({
      leadSlug: row.leadSlug,
      items: row.items,
      updatedAt: row.updatedAt,
    }));
  },
});
