import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { preferAdvancedHandoffStatus as preferAdvancedHandoffStatusCanonical } from "../src/lib/deploy/handoff-preserve";
import type { DeployHandoffStatus } from "../src/lib/deploy/types";
import { requireApiSecret } from "./lib/apiSecret";

const dnsInstruction = v.object({
  type: v.string(),
  host: v.string(),
  value: v.string(),
  purpose: v.string(),
});

const handoffReturn = v.object({
  id: v.string(),
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
  dnsInstructions: v.array(dnsInstruction),
  status: v.string(),
  vercelDomainStatus: v.optional(v.string()),
  vercelProjectId: v.optional(v.string()),
  notes: v.array(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

type HandoffDoc = {
  handoffId: string;
  leadSlug: string;
  businessName: string;
  tier: string;
  commerceAddon: boolean;
  stripeSessionId: string;
  customerEmail: string;
  previewUrl: string;
  suggestedHost: string;
  customDomain?: string;
  contactFormUrl: string;
  dnsInstructions: Array<{
    type: string;
    host: string;
    value: string;
    purpose: string;
  }>;
  status: string;
  vercelDomainStatus?: string;
  vercelProjectId?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
};

function toHandoff(row: HandoffDoc) {
  return {
    id: row.handoffId,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    tier: row.tier,
    commerceAddon: row.commerceAddon,
    stripeSessionId: row.stripeSessionId,
    customerEmail: row.customerEmail,
    previewUrl: row.previewUrl,
    suggestedHost: row.suggestedHost,
    customDomain: row.customDomain,
    contactFormUrl: row.contactFormUrl,
    dnsInstructions: row.dnsInstructions,
    status: row.status,
    vercelDomainStatus: row.vercelDomainStatus,
    vercelProjectId: row.vercelProjectId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Upsert by leadSlug — mirrors SQLite ON CONFLICT(leadSlug) DO UPDATE.
 * handoffId is caller-generated (same pattern as packId/orderId/inquiryId).
 */
export const upsert = mutation({
  args: {
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
    dnsInstructions: v.array(dnsInstruction),
    status: v.string(),
    vercelDomainStatus: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    notes: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Destructure apiSecret out before persisting — schema.ts's deployHandoffs
    // table is a strict defineTable that rejects unlisted fields, and the
    // previous plain `ctx.db.insert("deployHandoffs", args)` would otherwise
    // leak apiSecret into the row as an extra column (same gotcha as
    // orders.createOrder / leads.upsertLead / commerceOrders.insert /
    // checkoutSessions.create).
    const { apiSecret, ...handoff } = args;
    void apiSecret;
    const existing = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", handoff.leadSlug))
      .unique();

    if (existing) {
      // replace (not patch) so omitted optionals clear — matches SQLite NULL overwrite.
      await ctx.db.replace(existing._id, {
        handoffId: existing.handoffId,
        leadSlug: handoff.leadSlug,
        businessName: handoff.businessName,
        tier: handoff.tier,
        commerceAddon: handoff.commerceAddon,
        stripeSessionId: handoff.stripeSessionId,
        customerEmail: handoff.customerEmail,
        previewUrl: handoff.previewUrl,
        suggestedHost: handoff.suggestedHost,
        customDomain: handoff.customDomain,
        contactFormUrl: handoff.contactFormUrl,
        dnsInstructions: handoff.dnsInstructions,
        status: handoff.status,
        vercelDomainStatus: handoff.vercelDomainStatus,
        vercelProjectId: handoff.vercelProjectId,
        notes: handoff.notes,
        createdAt: existing.createdAt,
        updatedAt: handoff.updatedAt,
      });
      return null;
    }

    await ctx.db.insert("deployHandoffs", handoff);
    return null;
  },
});

export const getByLeadSlug = query({
  args: { leadSlug: v.string(), apiSecret: v.string() },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const row = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!row) return null;
    return toHandoff(row);
  },
});

export const list = query({
  args: { apiSecret: v.string() },
  returns: v.array(handoffReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    // Bounded by paid leads — collect + sort is fine (same as suppressions list).
    const rows = await ctx.db.query("deployHandoffs").collect();
    return rows
      .map(toHandoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/**
 * Host-based routing lookup for proxy.ts — given an inbound custom domain,
 * find which lead it belongs to. Empty-string customDomain values (cleared
 * domains) never match a lookup since real hosts are non-empty.
 */
export const getByCustomDomain = query({
  args: { customDomain: v.string(), apiSecret: v.string() },
  returns: v.union(v.object({ leadSlug: v.string() }), v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    if (!args.customDomain) return null;
    // .first() (not .unique()) — customDomain has no uniqueness constraint at
    // the DB level, and a rare operator collision must not throw for every
    // visitor on either domain; first match wins, same as SQLite LIMIT 1.
    const row = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_customDomain", (q) => q.eq("customDomain", args.customDomain))
      .first();
    if (!row) return null;
    return { leadSlug: row.leadSlug };
  },
});

/**
 * Progress rank for handoff status lives once, canonically, in
 * src/lib/deploy/handoff-preserve.ts (HANDOFF_STATUS_RANK /
 * preferAdvancedHandoffStatus) — imported directly here (a relative import
 * of a pure module with no `@/`-alias or server-only dependency, same
 * pattern as convex/orders.ts importing orderHadRecurringEntitlement from
 * src/lib/orders/recurring) instead of a second hand-maintained copy of the
 * rank table that can silently drift out of sync with the canonical one if a
 * status is ever added or reordered there. Note-only marker writes (bundle
 * receipt/DNS) must not regress live — see
 * handoff-email-marker-status-no-downgrade and
 * convex-orders-recurring-entitlement-duplicate-fix (the prior instance of
 * this exact duplication bug class). Convex's `status` schema field is a
 * plain v.string(), not the narrower DeployHandoffStatus union, so cast at
 * the call boundary only — the comparison logic itself is untouched.
 */
function preferAdvancedHandoffStatus(
  existing: string,
  requested: string,
): string {
  return preferAdvancedHandoffStatusCanonical(
    existing as DeployHandoffStatus,
    requested as DeployHandoffStatus,
  );
}

export const updateStatus = mutation({
  args: {
    leadSlug: v.string(),
    status: v.string(),
    extraNotes: v.array(v.string()),
    updatedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!existing) return null;

    // Atomic never-downgrade: webhook sent-markers pass a pre-Resend status
    // snapshot; if Mark live landed during that window, keep live.
    const status = preferAdvancedHandoffStatus(existing.status, args.status);
    const notes = [...existing.notes, ...args.extraNotes];
    await ctx.db.patch(existing._id, {
      status,
      notes,
      updatedAt: args.updatedAt,
    });

    return toHandoff({
      ...existing,
      status,
      notes,
      updatedAt: args.updatedAt,
    });
  },
});

export const updateVercelProject = mutation({
  args: {
    leadSlug: v.string(),
    /** Empty string clears the dedicated project (falls back to shared env). */
    vercelProjectId: v.string(),
    updatedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!existing) return null;

    const vercelProjectId = args.vercelProjectId.trim() || undefined;
    // replace so clearing the project actually drops the optional field.
    await ctx.db.replace(existing._id, {
      handoffId: existing.handoffId,
      leadSlug: existing.leadSlug,
      businessName: existing.businessName,
      tier: existing.tier,
      commerceAddon: existing.commerceAddon,
      stripeSessionId: existing.stripeSessionId,
      customerEmail: existing.customerEmail,
      previewUrl: existing.previewUrl,
      suggestedHost: existing.suggestedHost,
      customDomain: existing.customDomain,
      contactFormUrl: existing.contactFormUrl,
      dnsInstructions: existing.dnsInstructions,
      status: existing.status,
      vercelDomainStatus: existing.vercelDomainStatus,
      vercelProjectId,
      notes: existing.notes,
      createdAt: existing.createdAt,
      updatedAt: args.updatedAt,
    });

    return toHandoff({
      ...existing,
      vercelProjectId,
      updatedAt: args.updatedAt,
    });
  },
});

// Mirror src/lib/deploy/custom-domain-routing's customDomainHostAliases —
// Convex cannot import that module directly (it depends on @/lib/leads/slug-path,
// an alias import Convex's bundler does not resolve), same reason the host
// normalization above is hand-rolled rather than imported.
function hostAliasCandidates(host: string): string[] {
  if (host.startsWith("www.")) {
    const apex = host.slice(4);
    return apex ? [host, apex] : [host];
  }
  return [host, `www.${host}`];
}

export const updateCustomDomain = mutation({
  args: {
    leadSlug: v.string(),
    /** Empty string clears the custom domain (falls back to suggestedHost). */
    customDomain: v.string(),
    updatedAt: v.string(),
    apiSecret: v.string(),
  },
  returns: v.union(
    handoffReturn,
    v.null(),
    v.object({ conflict: v.literal(true), ownerSlug: v.string() }),
  ),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!existing) return null;

    // Bare hostname only (mirror src/lib/deploy/custom-domain-routing
    // normalizeOperatorCustomDomainHost — Convex cannot import src/).
    // Strip scheme/path/port/trailing FQDN dot so Host→preview matches.
    let customDomain: string | undefined;
    const raw = args.customDomain.trim();
    if (raw) {
      let host = "";
      try {
        const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
          ? raw
          : `https://${raw}`;
        host = new URL(withScheme).hostname.toLowerCase();
      } catch {
        host = raw
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .split("/")[0]
          ?.split("?")[0]
          ?.split("#")[0]
          ?.split(":")[0] ?? "";
      }
      host = host.replace(/\.$/, "").trim();
      customDomain = host || undefined;
    }

    // Atomic re-check immediately before the write — closes the TOCTOU
    // window between the caller's own getLeadSlugByCustomDomain precheck
    // and this mutation's persist (two concurrent Save domain requests for
    // two different leads can both pass that precheck before either write
    // lands). A Convex mutation is a single serialized transaction, so a
    // second concurrent call touching the same by_customDomain index entry
    // is retried against this call's already-committed result rather than
    // racing it — see custom-domain-assign-race-guard.
    if (customDomain) {
      for (const alias of hostAliasCandidates(customDomain)) {
        const conflict = await ctx.db
          .query("deployHandoffs")
          .withIndex("by_customDomain", (q) => q.eq("customDomain", alias))
          .first();
        if (conflict && conflict.leadSlug !== existing.leadSlug) {
          return { conflict: true as const, ownerSlug: conflict.leadSlug };
        }
      }
    }

    // replace so clearing the domain actually drops the optional field.
    await ctx.db.replace(existing._id, {
      handoffId: existing.handoffId,
      leadSlug: existing.leadSlug,
      businessName: existing.businessName,
      tier: existing.tier,
      commerceAddon: existing.commerceAddon,
      stripeSessionId: existing.stripeSessionId,
      customerEmail: existing.customerEmail,
      previewUrl: existing.previewUrl,
      suggestedHost: existing.suggestedHost,
      customDomain,
      contactFormUrl: existing.contactFormUrl,
      dnsInstructions: existing.dnsInstructions,
      status: existing.status,
      vercelDomainStatus: existing.vercelDomainStatus,
      vercelProjectId: existing.vercelProjectId,
      notes: existing.notes,
      createdAt: existing.createdAt,
      updatedAt: args.updatedAt,
    });

    return toHandoff({
      ...existing,
      customDomain,
      updatedAt: args.updatedAt,
    });
  },
});
