import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leads: defineTable({
    slug: v.string(),
    businessName: v.string(),
    category: v.string(), // "restaurant" | "salon" | "trades" | "generic"
    city: v.string(),
    state: v.string(),
    /** Optional street address for Maps embed pins + LocalBusiness JSON-LD streetAddress. */
    address: v.optional(v.string()),
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
    /** Last email in the 1→2→3 outreach sequence (0/undefined = none). */
    outreachStep: v.optional(v.number()),
    /** ISO timestamp of most recent outreach send. */
    lastOutreachAt: v.optional(v.string()),
    /** ISO timestamp of most recent attributed preview open. */
    lastPreviewOpenAt: v.optional(v.string()),
    /** Free-text operator notes (call outcomes) — dashboard only. */
    notes: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_stage", ["stage"]),

  orders: defineTable({
    leadSlug: v.string(),
    stripeSessionId: v.string(),
    /** Stripe Customer id for Billing Portal (subscriptions). */
    stripeCustomerId: v.optional(v.string()),
    customerEmail: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    amountTotal: v.number(),
    createdAt: v.number(),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_stripeSessionId", ["stripeSessionId"]),

  /** End-customer contact-form submissions (not outreach leads). */
  clientInquiries: defineTable({
    inquiryId: v.string(),
    leadSlug: v.string(),
    businessName: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    message: v.string(),
    status: v.string(), // "new" | "read" | "archived"
    source: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_inquiryId", ["inquiryId"])
    .index("by_leadSlug", ["leadSlug"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  /** Stripe Checkout Session tracking for abandoned-checkout recovery — see /docs/architecture#payments. */
  checkoutSessions: defineTable({
    leadSlug: v.string(),
    stripeSessionId: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    customerEmail: v.optional(v.string()),
    status: v.string(), // "open" | "complete"
    createdAt: v.string(),
    /** ISO timestamp of the last operator-triggered abandoned-checkout recovery email. */
    recoverySentAt: v.optional(v.string()),
  })
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_status", ["status"])
    .index("by_leadSlug", ["leadSlug"]),
});
