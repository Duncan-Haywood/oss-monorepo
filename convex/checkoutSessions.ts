import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";

/**
 * listOpen's return shape — see leads.ts's leadReturn/mapLeadRow doc comment
 * for the full rationale (leads-convex-query-return-validator-system-field-
 * leak). This was the sibling query still returning `v.array(v.any())` and
 * a raw `ctx.db` doc (carrying Convex's own `_id`/`_creationTime`) straight
 * through — src/lib/db.ts's listOpenCheckoutSessions() casts the result
 * `as CheckoutSessionRecord[]` with no field-level mapping, unlike every
 * other list query in this app (mapOrderRow, mapCheckoutSessionRow's own
 * SQLite twin, etc.), so a Convex-backed instance silently attached two
 * extra properties to every in-memory CheckoutSessionRecord that its own
 * TypeScript interface has no field for.
 */
// Match schema.ts's own looseness exactly (v.string() / v.optional(v.string())
// for tier/status/kind, not a stricter literal union) — markCompleteOpenBundleForLead's
// doc comment above already establishes why: kind in particular must let a
// stray/future third value round-trip untouched on both backends rather than
// reject it. A stricter union here would make listOpen throw on exactly the
// row shape that comment says must fall through safely.
const checkoutSessionReturn = v.object({
  leadSlug: v.string(),
  stripeSessionId: v.string(),
  tier: v.string(),
  commerceAddon: v.boolean(),
  customerEmail: v.optional(v.string()),
  status: v.string(),
  createdAt: v.string(),
  recoverySentAt: v.optional(v.string()),
  kind: v.optional(v.string()),
  skuId: v.optional(v.string()),
});

function mapCheckoutSessionRow(row: {
  leadSlug: string;
  stripeSessionId: string;
  tier: string;
  commerceAddon: boolean;
  customerEmail?: string;
  status: string;
  createdAt: string;
  recoverySentAt?: string;
  kind?: string;
  skuId?: string;
}) {
  return {
    leadSlug: row.leadSlug,
    stripeSessionId: row.stripeSessionId,
    tier: row.tier,
    commerceAddon: row.commerceAddon,
    customerEmail: row.customerEmail,
    status: row.status,
    createdAt: row.createdAt,
    recoverySentAt: row.recoverySentAt,
    kind: row.kind,
    skuId: row.skuId,
  };
}

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
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Destructure apiSecret out before persisting — schema.ts's checkoutSessions
    // table is a strict defineTable that rejects unlisted fields, and the
    // previous `{ ...args, status: "open" }` insert would otherwise leak
    // apiSecret into the row as an extra column (same gotcha as
    // orders.createOrder / leads.upsertLead / commerceOrders.insert).
    const { apiSecret, ...session } = args;
    void apiSecret;
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", session.stripeSessionId))
      .unique();
    if (existing) return null;
    await ctx.db.insert("checkoutSessions", { ...session, status: "open" });
    return null;
  },
});

export const markComplete = mutation({
  args: { stripeSessionId: v.string(), apiSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
  args: { stripeSessionId: v.string(), apiSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
    apiSecret: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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
    apiSecret: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
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

/**
 * Re-checks the freshly-read row's own status at write time — never trusts
 * the caller's earlier listOpen() snapshot alone. A dashboard recovery action
 * reads listOpen(), gates on the session still being "open", then calls this
 * mutation moments later; a concurrent Stripe webhook can complete the same
 * session in that window (real payment succeeding). Returns false (no patch)
 * once the row is missing or no longer "open", so the calling action can skip
 * sending a "finish your purchase" email to a customer who already paid
 * (checkout-session-recovery-race-guard — same action-vs-mutation lost-update
 * class as commerceOrders.markPaidOut / leads.recordOutreach / updateStage /
 * applyColdDisposition / inquiries.recordReply, applied to this call site).
 */
export const recordRecoverySent = mutation({
  args: { stripeSessionId: v.string(), sentAt: v.string(), apiSecret: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .unique();
    if (!session || session.status !== "open") {
      return false;
    }
    await ctx.db.patch(session._id, { recoverySentAt: args.sentAt });
    return true;
  },
});

export const listOpen = query({
  args: { apiSecret: v.string() },
  returns: v.array(checkoutSessionReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    // Match the SQLite fallback (ORDER BY createdAt ASC). The by_status index
    // has no createdAt sort field, so sort on the app createdAt (ISO string)
    // here — abandoned-recovery processes the oldest open carts first so the
    // longest-unrecovered (most urgent) sessions are prioritized. See
    // convex-query-ordering-parity in /docs/process.
    return rows
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(mapCheckoutSessionRow);
  },
});
