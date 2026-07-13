import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Work-next snooze policy for the operator's Snooze / Unsnooze action.
 *
 * When Convex is configured, snoozeLeadAction must pass
 * LEAD_SNOOZE_CONVEX_PRIMARY so a Convex mutation failure surfaces to the
 * operator instead of writing only to instance-local SQLite. isFollowUpDue
 * (follow-ups-due-exclude-snoozed) and pipeline-health / the daily digest all
 * read Convex-first — a SQLite-only snoozedUntil write would leave the lead
 * looking due everywhere else and risk an unwanted send right after the
 * operator explicitly asked to park it (CAN-SPAM exposure). The same is true
 * in reverse for Unsnooze: a SQLite-only clear would leave the lead invisible
 * on Work next/Follow-ups due on other instances even though the operator
 * intended to resurface it.
 *
 * Mirrors CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY / COMMERCE_PAID_OUT_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Dashboard keeps the
 * Convex→SQLite fallback when Convex is not configured.
 */

/** Fail-closed write options for leads.snoozedUntil marks. */
export const LEAD_SNOOZE_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
