import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for CRM lead create/import persist (upsertLead).
 *
 * getLeads / getLeadBySlug (Work next, pipeline-health, digest, outreach
 * eligibility, preview) all read Convex-first. addLeadAction and
 * importLeadsCsvAction must pass LEAD_UPSERT_CONVEX_PRIMARY so a Convex
 * mutation failure surfaces to the operator instead of claiming success after
 * a SQLite-only write — otherwise other instances never see the new inventory
 * (empty CRM, false funnel, outreach/checkout attribution miss the lead).
 *
 * Scope is create/import paths only. Field-level updates (notes, stage,
 * outreach, snooze, cold disposition) use their own requireConvex helpers —
 * do not route those through upsertLead.
 *
 * Payment-stub organic checkout creates go through recordLeadPayment /
 * markLeadPaid (already WEBHOOK_CONVEX_PRIMARY), not this helper.
 *
 * Mirrors MARKETING_PACK_CONVEX_PRIMARY / CLIENT_VOICE_PACK_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries).
 */

/** Fail-closed write options for leads upserts on create/import paths. */
export const LEAD_UPSERT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
