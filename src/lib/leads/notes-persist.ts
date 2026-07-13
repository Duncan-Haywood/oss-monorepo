import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for operator lead notes (updateLeadNotes).
 *
 * getLeads reads Convex-first. updateLeadNotesAction must pass
 * LEAD_NOTES_CONVEX_PRIMARY so a Convex mutation failure surfaces to the
 * operator instead of writing only to instance-local SQLite — otherwise
 * discovery-call / Email 3 notes prompts can claim success after a write
 * that other instances never see (call outcomes lost across deploys).
 *
 * Mirrors LEAD_SNOOZE_CONVEX_PRIMARY / COLD_DISPOSITION_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Dashboard keeps the
 * Convex→SQLite fallback when Convex is not configured.
 */

/** Fail-closed write options for lead.notes marks. */
export const LEAD_NOTES_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
