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
    /**
     * Stripe Connect Express account id for this local business (dormant
     * scaffold — see commerce-payouts-stripe-connect / stripe-connect-gate.ts).
     * Account creation/status-checking only; no payout/transfer flow reads
     * this yet.
     */
    stripeConnectAccountId: v.optional(v.string()),
    /**
     * Buffer profile ids the operator has chosen to auto-post this lead's
     * generated marketing pack content to (dormant scaffold — see
     * marketing-content-scheduling / src/lib/marketing/buffer-gate.ts).
     * Profile ids come from the operator's own Buffer account (listBufferProfiles);
     * no per-lead OAuth. Empty/absent means auto-posting is not set up for this lead.
     */
    bufferProfileIds: v.optional(v.array(v.string())),
    /**
     * Idempotency markers (bufferPostedVariantKey) for pack variants already
     * queued to Buffer this pack — prevents a repeated click from re-posting
     * the same content (buffer-schedule-duplicate-post-guard).
     */
    bufferPostedVariantKeys: v.optional(v.array(v.string())),
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
    /**
     * Unix ms when customer.subscription.deleted canceled recurring entitlement.
     * Optional — absent means still active (or never had recurring Prices).
     */
    recurringCanceledAt: v.optional(v.number()),
    amountTotal: v.number(),
    createdAt: v.number(),
    /**
     * ISO timestamp when Stripe charge.refunded (full or partial) resolved to
     * this order's Checkout Session. Optional — absent means never refunded.
     * See bundle-order-refund-tracking.
     */
    refundedAt: v.optional(v.string()),
    /**
     * ISO timestamp when Stripe charge.dispute.created (or dispute.closed lost)
     * resolved to this order's Checkout Session. Cleared on won / warning_closed.
     * See bundle-order-dispute-tracking.
     */
    disputedAt: v.optional(v.string()),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

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
    /**
     * Set once the Commerce client order-notification email succeeded — Stripe
     * redelivery recovers sendCommerceBuyNowClientReceipt while unset.
     */
    clientReceiptEmailSentAt: v.optional(v.string()),
    /**
     * Set once the Stripe webhook's charge.refunded handler resolves this
     * order's Checkout Session — a refunded end-customer sale owes the client
     * nothing (see commerce-order-refund-clawback-tracking). If paidOutAt was
     * already set before the refund landed, the operator already paid the
     * client out of pocket and must claw that amount back.
     */
    refundedAt: v.optional(v.string()),
    /**
     * Set once the Stripe webhook's charge.dispute.created handler resolves
     * this order's Checkout Session — Stripe debits the disputed amount from
     * the platform the moment a dispute opens (see
     * commerce-order-dispute-clawback-tracking), same payout-safety exposure
     * as refundedAt. If paidOutAt was already set before the dispute landed,
     * the operator already paid the client out of pocket and must claw that
     * amount back.
     */
    disputedAt: v.optional(v.string()),
    /**
     * Units of skuId actually purchased (Stripe adjustable_quantity line-item
     * quantity — see commerce-checkout-adjustable-quantity /
     * commerce-order-quantity-visibility). Optional: absent on rows recorded
     * before quantity capture shipped, or if a Session's line item ever lacks
     * a valid quantity.
     */
    quantity: v.optional(v.number()),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_stripeSessionId", ["stripeSessionId"]),

  /**
   * CAN-SPAM unsubscribe suppression list — every automated send (outreach,
   * follow-ups, digest, marketing/voice pack email) must check this before
   * sending. One row per suppressed email address.
   */
  suppressions: defineTable({
    email: v.string(),
  }).index("by_email", ["email"]),

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

  /**
   * Production deploy handoffs after paid bundle checkout — one row per lead.
   * Phase 5 fulfillment: DNS instructions, suggested host, Mark live.
   * handoffId is the app-owned id (mirrors packId/orderId/inquiryId).
   */
  deployHandoffs: defineTable({
    handoffId: v.string(),
    leadSlug: v.string(),
    businessName: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    stripeSessionId: v.string(),
    customerEmail: v.string(),
    previewUrl: v.string(),
    suggestedHost: v.string(),
    customDomain: v.optional(v.string()),
    contactFormUrl: v.string(),
    dnsInstructions: v.array(
      v.object({
        type: v.string(), // "A" | "CNAME" | "TXT"
        host: v.string(),
        value: v.string(),
        purpose: v.string(),
      }),
    ),
    status: v.string(), // "pending" | "awaiting_dns" | "provisioned" | "live" | "failed"
    vercelDomainStatus: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    notes: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_leadSlug", ["leadSlug"])
    .index("by_handoffId", ["handoffId"])
    .index("by_status", ["status"])
    .index("by_customDomain", ["customDomain"]),
});
