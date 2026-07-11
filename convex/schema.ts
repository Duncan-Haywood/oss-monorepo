import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leads: defineTable({
    slug: v.string(),
    businessName: v.string(),
    category: v.string(), // "restaurant" | "salon" | "trades" | "generic"
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
    stage: v.string(), // "discovered" | "site_built" | "outreach_sent" | "discovery_call" | "paid" | "live"
    recommendedTier: v.string(), // "starter" | "growth" | "complete"
    /** Provenance for compliance — see /docs/compliance */
    dataSource: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_stage", ["stage"]),

  orders: defineTable({
    leadSlug: v.string(),
    stripeSessionId: v.string(),
    customerEmail: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    amountTotal: v.number(),
    createdAt: v.number(),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_stripeSessionId", ["stripeSessionId"]),
});
