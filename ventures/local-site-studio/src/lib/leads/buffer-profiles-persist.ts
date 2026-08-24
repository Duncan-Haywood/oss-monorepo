import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for a lead's bufferProfileIds
 * (updateLeadBufferProfileIds).
 *
 * getLeads/getLeadBySlug read Convex-first. saveLeadBufferProfilesAction must
 * pass LEAD_BUFFER_PROFILES_CONVEX_PRIMARY so a Convex mutation failure
 * surfaces to the operator instead of writing only to instance-local SQLite —
 * otherwise the profile mapping the operator just chose would silently not
 * appear on any OTHER instance, and scheduleMarketingPackToBufferAction there
 * would see no profiles configured at all.
 *
 * Mirrors LEAD_STRIPE_CONNECT_CONVEX_PRIMARY / LEAD_NOTES_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Dashboard keeps the
 * Convex→SQLite fallback when Convex is not configured.
 */

/** Fail-closed write options for lead.bufferProfileIds marks. */
export const LEAD_BUFFER_PROFILES_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
