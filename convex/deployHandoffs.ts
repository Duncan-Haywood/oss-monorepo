import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();

    if (existing) {
      // replace (not patch) so omitted optionals clear — matches SQLite NULL overwrite.
      await ctx.db.replace(existing._id, {
        handoffId: existing.handoffId,
        leadSlug: args.leadSlug,
        businessName: args.businessName,
        tier: args.tier,
        commerceAddon: args.commerceAddon,
        stripeSessionId: args.stripeSessionId,
        customerEmail: args.customerEmail,
        previewUrl: args.previewUrl,
        suggestedHost: args.suggestedHost,
        customDomain: args.customDomain,
        contactFormUrl: args.contactFormUrl,
        dnsInstructions: args.dnsInstructions,
        status: args.status,
        vercelDomainStatus: args.vercelDomainStatus,
        vercelProjectId: args.vercelProjectId,
        notes: args.notes,
        createdAt: existing.createdAt,
        updatedAt: args.updatedAt,
      });
      return null;
    }

    await ctx.db.insert("deployHandoffs", args);
    return null;
  },
});

export const getByLeadSlug = query({
  args: { leadSlug: v.string() },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .unique();
    if (!row) return null;
    return toHandoff(row);
  },
});

export const list = query({
  args: {},
  returns: v.array(handoffReturn),
  handler: async (ctx) => {
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
  args: { customDomain: v.string() },
  returns: v.union(v.object({ leadSlug: v.string() }), v.null()),
  handler: async (ctx, args) => {
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
 * Progress rank for handoff status — keep in sync with
 * preferAdvancedHandoffStatus in src/lib/deploy/handoff-preserve.ts.
 * Note-only marker writes (bundle receipt/DNS) must not regress live.
 */
const HANDOFF_STATUS_RANK: Record<string, number> = {
  pending: 0,
  failed: 0,
  awaiting_dns: 1,
  provisioned: 2,
  live: 3,
};

function preferAdvancedHandoffStatus(
  existing: string,
  requested: string,
): string {
  const existingRank = HANDOFF_STATUS_RANK[existing] ?? 0;
  const requestedRank = HANDOFF_STATUS_RANK[requested] ?? 0;
  return requestedRank >= existingRank ? requested : existing;
}

export const updateStatus = mutation({
  args: {
    leadSlug: v.string(),
    status: v.string(),
    extraNotes: v.array(v.string()),
    updatedAt: v.string(),
  },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
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
  },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
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

export const updateCustomDomain = mutation({
  args: {
    leadSlug: v.string(),
    /** Empty string clears the custom domain (falls back to suggestedHost). */
    customDomain: v.string(),
    updatedAt: v.string(),
  },
  returns: v.union(handoffReturn, v.null()),
  handler: async (ctx, args) => {
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
