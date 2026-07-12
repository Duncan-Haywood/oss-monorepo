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
    stage: v.string(), // "discovered" | "site_built" | "outreach_sent" | "discovery_call" | "paid" | "live" | "closed"
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
    /** ISO timestamp until which this lead is parked off Work next. */
    snoozedUntil: v.optional(v.string()),
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
    status: v.string(), // "new" | "read" | "replied" | "archived"
    source: v.optional(v.string()),
    /** Last operator reply body sent from the dashboard. */
    operatorReply: v.optional(v.string()),
    /** Unix ms when the last dashboard reply was sent. */
    repliedAt: v.optional(v.number()),
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
    /**
     * "bundle" | "commerce_sku". Optional for legacy rows (treat as bundle).
     * Required when writing new commerce Buy now sessions.
     */
    kind: v.optional(v.string()),
    /** Present when kind === "commerce_sku". */
    skuId: v.optional(v.string()),
  })
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_status", ["status"])
    .index("by_leadSlug", ["leadSlug"]),

  /**
   * Monthly AI marketing packs for paid Growth/Complete leads.
   * One row per lead per UTC calendar month — regenerating replaces that month.
   */
  marketingPacks: defineTable({
    packId: v.string(),
    leadSlug: v.string(),
    yearMonth: v.string(), // YYYY-MM (UTC)
    variants: v.array(
      v.object({
        contentType: v.string(),
        title: v.optional(v.string()),
        body: v.string(),
        cta: v.optional(v.string()),
        hashtags: v.optional(v.array(v.string())),
        scheduledFor: v.optional(v.string()),
      }),
    ),
    generatedAt: v.string(),
    generator: v.string(), // "stub" | "anthropic"
    packageTier: v.optional(v.string()),
  })
    .index("by_lead_month", ["leadSlug", "yearMonth"])
    .index("by_month", ["yearMonth"])
    .index("by_packId", ["packId"]),

  /**
   * Commerce add-on catalogs (≤50 SKUs) for paid/live leads with commerceAddon.
   * One row per lead — regenerating replaces the whole catalog.
   */
  commerceCatalogs: defineTable({
    leadSlug: v.string(),
    items: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        priceCents: v.number(),
        stripeProductId: v.optional(v.string()),
        stripePriceId: v.optional(v.string()),
      }),
    ),
    updatedAt: v.string(),
  }).index("by_leadSlug", ["leadSlug"]),

  /**
   * End-customer "Buy now" purchases of a Commerce catalog SKU — pass-through
   * revenue for the lead's own shop, NOT Local Site Studio's own `orders`
   * revenue. Append-only ledger, one row per completed Checkout Session.
   */
  commerceOrders: defineTable({
    orderId: v.string(),
    leadSlug: v.string(),
    skuId: v.string(),
    skuName: v.string(),
    amountPaidUsd: v.number(),
    stripeSessionId: v.string(),
    createdAt: v.string(),
    /** Set once an operator has manually paid this order's amount out to the client. */
    paidOutAt: v.optional(v.string()),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_stripeSessionId", ["stripeSessionId"]),

  /**
   * Client voice FAQ/script packs for paid Complete leads.
   * One row per lead — regenerating replaces (not month-keyed; scripts are durable).
   */
  clientVoicePacks: defineTable({
    packId: v.string(),
    leadSlug: v.string(),
    variants: v.array(
      v.object({
        scriptType: v.string(),
        title: v.string(),
        body: v.string(),
        cta: v.optional(v.string()),
      }),
    ),
    generatedAt: v.string(),
    generator: v.string(), // "stub" | "anthropic"
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_packId", ["packId"]),
});
