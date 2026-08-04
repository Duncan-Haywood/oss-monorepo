import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for cold-lead disposition (applyColdLeadDisposition).
 *
 * getLeads / cold-lead badges / the stage funnel / pipeline-health cold counts
 * all read Convex-first. disposeColdLeadAction must pass
 * COLD_DISPOSITION_CONVEX_PRIMARY so a Convex mutation failure surfaces to the
 * operator instead of writing only to instance-local SQLite — otherwise
 * Re-engage/Close can succeed locally while other instances still show the
 * lead as cold (or still open after Close). Email 1 on re-engage already uses
 * OUTREACH_CADENCE_CONVEX_PRIMARY for the outreach mark; this covers the
 * disposition write itself.
 *
 * Mirrors LEAD_SNOOZE_CONVEX_PRIMARY / COMMERCE_PAID_OUT_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Dashboard keeps the
 * Convex→SQLite fallback when Convex is not configured.
 */

/** Fail-closed write options for cold-lead Re-engage / Close patches. */
export const COLD_DISPOSITION_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
