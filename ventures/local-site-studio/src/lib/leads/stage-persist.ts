import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for dashboard lead stage moves (updateLeadStage).
 *
 * getLeads / getLeadBySlug / pipeline-health / the stage funnel all read
 * Convex-first. updateLeadStageAction must pass LEAD_STAGE_CONVEX_PRIMARY so a
 * Convex mutation failure surfaces to the operator instead of claiming success
 * after a SQLite-only write — otherwise other instances never see the stage
 * move (false funnel + Work next / digest drift).
 *
 * Especially important for the outreach_sent path: recordLeadOutreach already
 * fails closed via OUTREACH_CADENCE_CONVEX_PRIMARY, but a soft-fallback stage
 * write can leave stage on SQLite while outreachStep advances on Convex (or
 * vice versa after a later retry). Fail-closed stage keeps the two marks
 * aligned across instances.
 *
 * Mark live already passes DEPLOY_HANDOFF_CONVEX_PRIMARY into updateLeadStage —
 * this constant is for the dashboard stage dropdown / manual moves only.
 *
 * Mirrors LEAD_NOTES_CONVEX_PRIMARY / LEAD_UPSERT_CONVEX_PRIMARY (operator
 * action, fail closed, operator retries). Dashboard keeps the Convex→SQLite
 * fallback when Convex is not configured.
 */

/** Fail-closed write options for lead.stage marks from the dashboard. */
export const LEAD_STAGE_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
