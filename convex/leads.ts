import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("leads").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const updateStage = mutation({
  args: {
    slug: v.string(),
    stage: v.union(
      v.literal("discovered"),
      v.literal("site_built"),
      v.literal("outreach_sent"),
      v.literal("discovery_call"),
      v.literal("paid"),
      v.literal("live")
    ),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    await ctx.db.patch(lead._id, { stage: args.stage });
  },
});

export const upsertLead = mutation({
  args: {
    slug: v.string(),
    businessName: v.string(),
    category: v.union(
      v.literal("restaurant"),
      v.literal("salon"),
      v.literal("trades"),
      v.literal("generic")
    ),
    city: v.string(),
    state: v.string(),
    tagline: v.string(),
    description: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    services: v.array(v.string()),
    hours: v.object({
      weekday: v.string(),
      weekend: v.string(),
    }),
    stage: v.union(
      v.literal("discovered"),
      v.literal("site_built"),
      v.literal("outreach_sent"),
      v.literal("discovery_call"),
      v.literal("paid"),
      v.literal("live")
    ),
    recommendedTier: v.union(
      v.literal("starter"),
      v.literal("growth"),
      v.literal("complete")
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("leads", args);
    }
  },
});

export const markLeadPaid = mutation({
  args: {
    slug: v.string(),
    stripeSessionId: v.string(),
    customerEmail: v.string(),
    tier: v.union(
      v.literal("starter"),
      v.literal("growth"),
      v.literal("complete")
    ),
    commerceAddon: v.boolean(),
    amountTotal: v.float64(),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (lead) {
      await ctx.db.patch(lead._id, { stage: "paid" });
    }

    // Insert order record — field name is leadSlug to match schema
    await ctx.db.insert("orders", {
      leadSlug: args.slug,
      tier: args.tier,
      commerceAddon: args.commerceAddon,
      stripeSessionId: args.stripeSessionId,
      amountTotal: args.amountTotal,
      customerEmail: args.customerEmail,
      createdAt: Date.now(),
    });
  },
});

export const seed = mutation({
  args: {
    leads: v.array(
      v.object({
        slug: v.string(),
        businessName: v.string(),
        category: v.union(
          v.literal("restaurant"),
          v.literal("salon"),
          v.literal("trades"),
          v.literal("generic")
        ),
        city: v.string(),
        state: v.string(),
        tagline: v.string(),
        description: v.string(),
        phone: v.string(),
        email: v.optional(v.string()),
        services: v.array(v.string()),
        hours: v.object({
          weekday: v.string(),
          weekend: v.string(),
        }),
        stage: v.union(
          v.literal("discovered"),
          v.literal("site_built"),
          v.literal("outreach_sent"),
          v.literal("discovery_call"),
          v.literal("paid"),
          v.literal("live")
        ),
        recommendedTier: v.union(
          v.literal("starter"),
          v.literal("growth"),
          v.literal("complete")
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existingLeads = await ctx.db.query("leads").collect();
    if (existingLeads.length > 0) {
      return { message: "Database already seeded", count: existingLeads.length };
    }
    let inserted = 0;
    for (const lead of args.leads) {
      await ctx.db.insert("leads", lead);
      inserted++;
    }
    return { message: "Database seeded successfully", count: inserted };
  },
});
