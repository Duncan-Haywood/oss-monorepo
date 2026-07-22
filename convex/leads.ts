import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeLeadCategory,
  normalizeLeadRecommendedTier,
} from "../src/lib/leads/category-normalize";
import { buildPaymentStubLeadFields } from "../src/lib/leads/payment-stub";
import { requireApiSecret } from "./lib/apiSecret";

const categoryValidator = v.union(
  v.literal("restaurant"),
  v.literal("salon"),
  v.literal("trades"),
  v.literal("generic"),
);

const stageValidator = v.union(
  v.literal("discovered"),
  v.literal("site_built"),
  v.literal("outreach_sent"),
  v.literal("discovery_call"),
  v.literal("paid"),
  v.literal("live"),
  v.literal("closed"),
);

const tierValidator = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("complete"),
);

const leadFields = {
  slug: v.string(),
  businessName: v.string(),
  category: categoryValidator,
  city: v.string(),
  state: v.string(),
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
  stage: stageValidator,
  recommendedTier: tierValidator,
  dataSource: v.optional(v.string()),
  outreachStep: v.optional(v.number()),
  lastOutreachAt: v.optional(v.string()),
  lastPreviewOpenAt: v.optional(v.string()),
  notes: v.optional(v.string()),
  snoozedUntil: v.optional(v.string()),
};

/**
 * list/getBySlug's return shape — every OTHER Convex file in this app
 * (orders/commerceOrders/deployHandoffs/marketingPacks/clientVoicePacks/
 * commerceCatalogs/inquiries) defines an explicit `xReturn` validator + a
 * mapping function that names every field, so a raw `ctx.db` doc (which
 * always carries Convex's own `_id`/`_creationTime` system fields, per
 * https://docs.convex.dev/database/document-storage#document-ids) never
 * reaches a caller unmapped. leads.ts's list/getBySlug were the one
 * remaining pair returning `v.array(v.any())`/`v.any()` and the raw doc
 * itself — src/lib/db.ts's getLeads()/getLeadBySlug() then blindly cast
 * that raw doc `as Lead[]`/`as Lead`, so on a Convex-backed deployment every
 * in-memory `Lead` object silently carried two extra enumerable properties
 * (`_id`, `_creationTime`) the `Lead` TypeScript interface has no field for
 * — unlike the SQLite fallback (mapSqliteRowToLead builds a clean object
 * literal with only `Lead`'s own fields). That divergence isn't just a
 * type/style inconsistency: it directly undermined the just-shipped
 * `softCapLeadForPublicSurface` / `PublicLead` hardening
 * (public-lead-strip-notes-and-stripe-connect-id) — that fix destructures
 * only `notes`/`stripeConnectAccountId` out of `lead` before spreading
 * `...publicLead`, so on a Convex-backed instance the "safe for a public
 * surface" object would still carry a Convex-internal document id via the
 * spread, since `_id`/`_creationTime` were never named fields to strip.
 * Explicit mapping (mirroring commerceOrders.ts's mapOrderRow) closes this
 * for both backends the same way every other table already does. See
 * leads-convex-query-return-validator-system-field-leak.
 *
 * Deliberately does NOT reuse `leadFields`'s strict category/stage/
 * recommendedTier literal unions as the RETURN VALIDATOR here — those exist
 * to validate WRITES (upsertLead/seed args), but schema.ts itself stores all
 * three as plain `v.string()` (its own comments note the literal values are
 * documented, not schema-enforced). A stricter return validator would make
 * list/getBySlug throw at runtime for any pre-existing row whose value
 * predates (or otherwise falls outside) the current literal set, turning a
 * merely unexpected value into a hard 500 on every dashboard/preview read for
 * that row instead of just passing it through — the same class of risk
 * checkoutSessions.ts's kind field is already documented to guard against.
 * `stage` is left as a raw pass-through (dashboard/pipeline-health render it
 * as plain text — no downstream lookup crashes on an unrecognized value).
 *
 * `category` and `recommendedTier` are different: category feeds a direct
 * object-keyed lookup with no fallback downstream (getCategoryTheme's
 * CATEGORY_THEMES[category] in src/lib/previews/themes.ts, consumed by the
 * public /preview/[slug] page and its OG-image routes) — an unrecognized
 * value there doesn't just render oddly, it throws. mapSqliteRowToLead
 * (src/lib/leads/sqlite-row-mapping.ts) has always defended against this by
 * falling back to "generic"/a category-derived tier default for an
 * unrecognized stored value; this mapping function did not, so the exact
 * same corrupt row degraded gracefully on SQLite but 500'd on Convex — a
 * dual-backend parity gap in read-time value safety, not row ordering.
 * mapLeadRow now runs both fields through the same shared normalizer
 * (normalizeLeadCategory / normalizeLeadRecommendedTier, category-normalize.ts)
 * mapSqliteRowToLead uses, so the return validator can stay loose (`v.string()`,
 * no new RPC-throw risk) while the actual value it returns is always one of
 * the current literals on both backends (leads-category-tier-read-normalize-parity).
 */
const leadReturn = v.object({
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  city: v.string(),
  state: v.string(),
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
  stage: v.string(),
  recommendedTier: v.string(),
  dataSource: v.optional(v.string()),
  outreachStep: v.optional(v.number()),
  lastOutreachAt: v.optional(v.string()),
  lastPreviewOpenAt: v.optional(v.string()),
  notes: v.optional(v.string()),
  snoozedUntil: v.optional(v.string()),
  stripeConnectAccountId: v.optional(v.string()),
});

function mapLeadRow(row: {
  slug: string;
  businessName: string;
  category: string;
  city: string;
  state: string;
  address?: string;
  tagline: string;
  description: string;
  phone: string;
  email?: string;
  services: string[];
  hours: { weekday: string; weekend: string };
  stage: string;
  recommendedTier: string;
  dataSource?: string;
  outreachStep?: number;
  lastOutreachAt?: string;
  lastPreviewOpenAt?: string;
  notes?: string;
  snoozedUntil?: string;
  stripeConnectAccountId?: string;
}) {
  const category = normalizeLeadCategory(row.category);
  return {
    slug: row.slug,
    businessName: row.businessName,
    category,
    city: row.city,
    state: row.state,
    address: row.address,
    tagline: row.tagline,
    description: row.description,
    phone: row.phone,
    email: row.email,
    services: row.services,
    hours: row.hours,
    stage: row.stage,
    recommendedTier: normalizeLeadRecommendedTier(row.recommendedTier, category),
    dataSource: row.dataSource,
    outreachStep: row.outreachStep,
    lastOutreachAt: row.lastOutreachAt,
    lastPreviewOpenAt: row.lastPreviewOpenAt,
    notes: row.notes,
    snoozedUntil: row.snoozedUntil,
    stripeConnectAccountId: row.stripeConnectAccountId,
  };
}

export const list = query({
  args: { apiSecret: v.string() },
  returns: v.array(leadReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Match the SQLite fallback (getLeads: ORDER BY createdAt DESC — newest
    // first). The leads table has no explicit createdAt field, so _creationTime
    // descending is the closest available proxy; a bare .collect() returns
    // _creationTime ASCENDING, which reversed the /dashboard/leads table order
    // between backends. See convex-query-ordering-parity in /docs/process.
    const rows = await ctx.db.query("leads").order("desc").collect();
    return rows.map(mapLeadRow);
  },
});

export const getBySlug = query({
  args: { slug: v.string(), apiSecret: v.string() },
  returns: v.union(leadReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!row) return null;
    return mapLeadRow(row);
  },
});

export const updateStage = mutation({
  args: {
    slug: v.string(),
    stage: stageValidator,
    apiSecret: v.string(),
  },
  /**
   * false when the fresh row had already gone paid/live and this write
   * would revert it to an earlier stage — patch skipped
   * (update-lead-stage-action-paid-live-revert-guard). A write that itself
   * targets paid or live is always allowed even from a paid/live row (the
   * normal Mark-live and re-confirm transitions).
   */
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    if (
      (lead.stage === "paid" || lead.stage === "live") &&
      args.stage !== "paid" &&
      args.stage !== "live"
    ) {
      return false;
    }
    await ctx.db.patch(lead._id, { stage: args.stage });
    return true;
  },
});

export const upsertLead = mutation({
  args: { ...leadFields, apiSecret: v.string() },
  /**
   * Create-only, atomic at write time: returns false (no write) when a row
   * with this slug already exists by the time this mutation runs, instead of
   * patching it — see lead-upsert-create-only-race-guard. Both call sites
   * (addLeadAction, importLeadsCsvAction) already treat a pre-existing slug
   * as a conflict via their own earlier existence check, never a legitimate
   * update; a stale bulk snapshot (importLeadsCsvAction reads all existing
   * slugs once, then loops up to MAX_ROWS sequential upserts) must not let a
   * lead created/promoted mid-loop be silently reverted to CSV defaults.
   */
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const { apiSecret, ...leadData } = args;
    void apiSecret;
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", leadData.slug))
      .unique();
    if (existing) {
      return false;
    }
    await ctx.db.insert("leads", leadData);
    return true;
  },
});

export const markLeadPaid = mutation({
  args: {
    slug: v.string(),
    stripeSessionId: v.string(),
    customerEmail: v.string(),
    tier: tierValidator,
    commerceAddon: v.boolean(),
    amountTotal: v.float64(),
    stripeCustomerId: v.optional(v.string()),
    apiSecret: v.string(),
  },
  // Returns whether this call recorded a *new* order — false means Stripe
  // redelivered a checkout.session.completed event we already processed, and
  // the caller must not resend receipt/handoff emails for it (see
  // AGENT_PROTOCOL: every webhook-written ledger must be idempotent on
  // stripeSessionId; `orders` previously lacked this, unlike checkout_sessions
  // and commerce_orders).
  returns: v.object({ alreadyRecorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (existing) {
      return { alreadyRecorded: true };
    }

    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (lead) {
      // Never regress an already-live lead back to "paid" — this mutation
      // fires on every successful bundle checkout, including a paid Starter
      // upsell to Growth/Complete on a lead whose site is already deployed
      // (leadEligibleForStarterUpsell explicitly allows stage="live"). The
      // order row below still records the new revenue either way; only the
      // stage patch is guarded, mirroring the automatic-write-never-downgrades
      // precedent (preferAdvancedHandoffStatus /
      // update-lead-stage-action-paid-live-revert-guard) rather than the
      // dashboard operator's manual updateStage, which intentionally still
      // allows a human to set paid<->live directly.
      if (lead.stage !== "live") {
        await ctx.db.patch(lead._id, { stage: "paid" });
      }
    } else {
      // Parity with SQLite recordLeadPayment: checkout can complete before a
      // CRM lead row exists. Insert a paid stub so listOrders revenue and
      // paidNotLive / handoff eligibility stay consistent. Defaults come from
      // the canonical buildPaymentStubLeadFields (src/lib/leads/payment-stub.ts)
      // — previously this handler forked its own private copy of the same
      // businessName-from-slug + stub-defaults logic, the same duplicate-logic
      // drift class fixed once already in convex/orders.ts and
      // convex/deployHandoffs.ts (see AGENT_PROTOCOL /
      // convex-deploy-handoff-status-rank-duplicate-fix).
      await ctx.db.insert("leads", buildPaymentStubLeadFields(args.slug));
    }

    await ctx.db.insert("orders", {
      leadSlug: args.slug,
      tier: args.tier,
      commerceAddon: args.commerceAddon,
      stripeSessionId: args.stripeSessionId,
      stripeCustomerId: args.stripeCustomerId,
      amountTotal: args.amountTotal,
      customerEmail: args.customerEmail,
      createdAt: Date.now(),
    });
    return { alreadyRecorded: false };
  },
});

export const recordOutreach = mutation({
  args: {
    slug: v.string(),
    outreachStep: v.union(v.literal(1), v.literal(2), v.literal(3)),
    lastOutreachAt: v.string(),
    apiSecret: v.string(),
  },
  /**
   * false when the fresh row had already gone paid/live/closed, or the lead's
   * current outreachStep already reached/passed args.outreachStep — patch
   * skipped either way. The latter closes a duplicate-send window: two
   * concurrent sendFollowUpAction/updateLeadStageAction("outreach_sent")
   * calls (a double-click, or two operator tabs) both read the same
   * pre-write outreachStep, both compute the same target step, both pass
   * the paid/live/closed check, and — without this guard — both patched the
   * row and both proceeded to send the real Resend Email 1/2/3 to a live
   * prospect (outreach-step-duplicate-send-guard).
   */
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    if (lead.stage === "paid" || lead.stage === "live" || lead.stage === "closed") {
      return false;
    }
    if ((lead.outreachStep ?? 0) >= args.outreachStep) {
      return false;
    }
    await ctx.db.patch(lead._id, {
      outreachStep: args.outreachStep,
      lastOutreachAt: args.lastOutreachAt,
    });
    return true;
  },
});

export const recordPreviewOpen = mutation({
  args: {
    slug: v.string(),
    openedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      // Organic / slug-inferred previews may not be persisted yet — no-op.
      return null;
    }
    await ctx.db.patch(lead._id, {
      lastPreviewOpenAt: args.openedAt,
    });
    return null;
  },
});

export const updateNotes = mutation({
  args: {
    slug: v.string(),
    /** Empty string clears notes; undefined is treated the same. */
    notes: v.optional(v.string()),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    // Convex patch ignores undefined keys — persist "" so clears stick.
    await ctx.db.patch(lead._id, {
      notes: args.notes ?? "",
    });
    return null;
  },
});

export const updateSnooze = mutation({
  args: {
    slug: v.string(),
    /** Empty string clears snooze; undefined is treated the same. */
    snoozedUntil: v.optional(v.string()),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    // Convex patch ignores undefined keys — persist "" so clears stick.
    await ctx.db.patch(lead._id, {
      snoozedUntil: args.snoozedUntil ?? "",
    });
    return null;
  },
});

export const updateStripeConnectAccountId = mutation({
  args: {
    slug: v.string(),
    /** Empty string clears; undefined is treated the same. */
    stripeConnectAccountId: v.optional(v.string()),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    // Convex patch ignores undefined keys — persist "" so clears stick.
    await ctx.db.patch(lead._id, {
      stripeConnectAccountId: args.stripeConnectAccountId ?? "",
    });
    return null;
  },
});

/**
 * Apply a cold-lead disposition patch (re-engage or close) in one write.
 * Caller validates via planColdLeadDisposition — but that validation runs
 * against a snapshot read moments earlier in disposeColdLeadAction, so this
 * mutation re-checks the one condition that matters (paid/live) atomically
 * against the fresh row immediately before patching — mirrors
 * commerceOrders.markPaidOut's re-check-at-write-time shape
 * (commerce-order-paid-out-refund-race-guard) for the same TOCTOU class: a
 * concurrent Stripe checkout completing between the action's read and this
 * write must not have its stage='paid'/'live' silently reverted back to
 * closed/discovered by a stale Close/Re-engage click.
 */
export const applyColdDisposition = mutation({
  args: {
    slug: v.string(),
    stage: stageValidator,
    outreachStep: v.number(),
    /** Empty string clears lastOutreachAt. */
    lastOutreachAt: v.optional(v.string()),
    /** Empty string clears snooze. */
    snoozedUntil: v.optional(v.string()),
    apiSecret: v.string(),
  },
  /** false when the fresh row had already gone paid/live — patch skipped. */
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    if (lead.stage === "paid" || lead.stage === "live") {
      return false;
    }
    await ctx.db.patch(lead._id, {
      stage: args.stage,
      outreachStep: args.outreachStep,
      lastOutreachAt: args.lastOutreachAt ?? "",
      snoozedUntil: args.snoozedUntil ?? "",
    });
    return true;
  },
});

export const seed = mutation({
  args: {
    leads: v.array(v.object(leadFields)),
    apiSecret: v.string(),
  },
  returns: v.object({
    message: v.string(),
    count: v.number(),
  }),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
