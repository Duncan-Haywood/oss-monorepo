import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db.query("leads").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.any(), v.null()),
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
    stage: stageValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    await ctx.db.patch(lead._id, { stage: args.stage });
    return null;
  },
});

export const upsertLead = mutation({
  args: leadFields,
  returns: v.null(),
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
    return null;
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
  },
  // Returns whether this call recorded a *new* order — false means Stripe
  // redelivered a checkout.session.completed event we already processed, and
  // the caller must not resend receipt/handoff emails for it (see
  // AGENT_PROTOCOL: every webhook-written ledger must be idempotent on
  // stripeSessionId; `orders` previously lacked this, unlike checkout_sessions
  // and commerce_orders).
  returns: v.object({ alreadyRecorded: v.boolean() }),
  handler: async (ctx, args) => {
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
      // A Starter -> Growth/Complete upsell checkout (leadEligibleForStarterUpsell
      // in src/lib/billing/starter-upsell.ts fires at stage "paid" OR "live")
      // carries a new stripeSessionId, so the idempotency check above doesn't
      // catch it. Don't let a second payment regress an already-live lead back
      // to "paid" — pipeline-health and the daily digest key off that stage.
      if (lead.stage !== "live") {
        await ctx.db.patch(lead._id, { stage: "paid" });
      }
    } else {
      // Parity with SQLite recordLeadPayment: checkout can complete before a
      // CRM lead row exists. Insert a paid stub so listOrders revenue and
      // paidNotLive / handoff eligibility stay consistent. Defaults must stay
      // in sync with src/lib/leads/payment-stub.ts buildPaymentStubLeadFields.
      const businessName =
        args.slug
          .split("-")
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ") || "Unknown";
      await ctx.db.insert("leads", {
        slug: args.slug,
        businessName,
        category: "generic",
        city: "Colorado",
        state: "CO",
        tagline: "Local favorites made fresh daily",
        description: `This is a preview page generated for ${businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
        phone: "(555) 000-0000",
        services: [],
        hours: {
          weekday: "Mon–Fri 9am–5pm",
          weekend: "Sat–Sun Closed",
        },
        stage: "paid",
        recommendedTier: "growth",
        dataSource: "payment_stub",
      });
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    await ctx.db.patch(lead._id, {
      outreachStep: args.outreachStep,
      lastOutreachAt: args.lastOutreachAt,
    });
    return null;
  },
});

export const recordPreviewOpen = mutation({
  args: {
    slug: v.string(),
    openedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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

/**
 * Apply a cold-lead disposition patch (re-engage or close) in one write.
 * Caller validates via planColdLeadDisposition — this only persists fields.
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!lead) {
      throw new Error(`Lead with slug ${args.slug} not found`);
    }
    await ctx.db.patch(lead._id, {
      stage: args.stage,
      outreachStep: args.outreachStep,
      lastOutreachAt: args.lastOutreachAt ?? "",
      snoozedUntil: args.snoozedUntil ?? "",
    });
    return null;
  },
});

export const seed = mutation({
  args: {
    leads: v.array(v.object(leadFields)),
  },
  returns: v.object({
    message: v.string(),
    count: v.number(),
  }),
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
