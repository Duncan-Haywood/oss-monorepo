import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    leadSlug: v.string(),
    stripeSessionId: v.string(),
    tier: v.string(),
    commerceAddon: v.boolean(),
    customerEmail: v.optional(v.string()),
    createdAt: v.string(),
    kind: v.optional(v.union(v.literal("bundle"), v.literal("commerce_sku"))),
    skuId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (existing) return null;
    await ctx.db.insert("checkoutSessions", { ...args, status: "open" });
    return null;
  },
});

export const markComplete = mutation({
  args: { stripeSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { status: "complete" });
    }
    return null;
  },
});

/**
 * Re-opens a checkout_sessions row after checkout.session.async_payment_failed.
 * Unpaid completed marks the row complete (stop recovery while ACH clears);
 * a failed async payment must reopen so Finish-checkout / Buy now recovery
 * can nudge a retry. Safe no-op when no row matches.
 */
export const markOpen = mutation({
  args: { stripeSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { status: "open" });
    }
    return null;
  },
});

/**
 * After a paid bundle Checkout Session, mark other open *bundle* rows for the
 * same leadSlug complete so Finish-checkout / digest / pipeline-health cannot
 * nudge an already-paid customer. Never touches commerce_sku (multi-shopper).
 * Returns how many sibling rows were closed.
 */
export const markCompleteOpenBundleForLead = mutation({
  args: {
    leadSlug: v.string(),
    exceptStripeSessionId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    let closed = 0;
    for (const row of rows) {
      if (row.status !== "open") continue;
      if (row.stripeSessionId === args.exceptStripeSessionId) continue;
      // Allowlist bundle rows the same way the SQLite fallback's WHERE clause
      // does (kind IS NULL OR '' OR 'bundle') — never a "!== commerce_sku"
      // blocklist. The checkoutSessions table stores kind as a loose
      // v.optional(v.string()) (see schema.ts), not the closed
      // "bundle" | "commerce_sku" union `create` validates on write, so a
      // stray/future third kind value must fall through untouched on both
      // backends rather than get silently closed here.
      if (row.kind !== undefined && row.kind !== "" && row.kind !== "bundle") continue;
      await ctx.db.patch(row._id, { status: "complete" });
      closed += 1;
    }
    return closed;
  },
});

/**
 * After a paid commerce_sku Checkout Session, mark other open commerce_sku
 * rows for the same leadSlug + skuId + customerEmail complete so Buy now
 * recovery / digest cannot nudge the same shopper after they pay. Never
 * closes when customerEmail is blank (multi-shopper carts). Email match is
 * trim + lowercase. Returns how many sibling rows were closed.
 */
export const markCompleteOpenCommerceForLeadSkuCustomer = mutation({
  args: {
    leadSlug: v.string(),
    skuId: v.string(),
    customerEmail: v.string(),
    exceptStripeSessionId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const email = args.customerEmail.trim().toLowerCase();
    const skuId = args.skuId.trim();
    if (!email || !skuId) return 0;
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .collect();
    let closed = 0;
    for (const row of rows) {
      if (row.status !== "open") continue;
      if (row.stripeSessionId === args.exceptStripeSessionId) continue;
      if (row.kind !== "commerce_sku") continue;
      if ((row.skuId ?? "").trim() !== skuId) continue;
      const rowEmail = (row.customerEmail ?? "").trim().toLowerCase();
      if (!rowEmail || rowEmail !== email) continue;
      await ctx.db.patch(row._id, { status: "complete" });
      closed += 1;
    }
    return closed;
  },
});

export const recordRecoverySent = mutation({
  args: { stripeSessionId: v.string(), sentAt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (session) {
      await ctx.db.patch(session._id, { recoverySentAt: args.sentAt });
    }
    return null;
  },
});

export const listOpen = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    // Match the SQLite fallback (ORDER BY createdAt ASC). The by_status index
    // has no createdAt sort field, so sort on the app createdAt (ISO string)
    // here — abandoned-recovery processes the oldest open carts first so the
    // longest-unrecovered (most urgent) sessions are prioritized. See
    // convex-query-ordering-parity in /docs/process.
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
});
