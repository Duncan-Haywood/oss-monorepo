import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for the Growth upsell sent-marker
 * (recordGrowthUpsellSent). Mirrors STARTER_UPSELL_SENT_CONVEX_PRIMARY
 * (src/lib/leads/starter-upsell-persist.ts): getLeads / getLeadBySlug read
 * Convex-first, so sendGrowthUpsellAction must pass this so a Convex
 * mutation failure surfaces to the operator instead of silently landing
 * only in instance-local SQLite — a split-brain count would defeat the CAS
 * guard's whole purpose on the next request routed to a different instance.
 * Count-based CAS shape (not a one-shot gate): this marker does not block a
 * later, deliberate resend, only an exact concurrent duplicate.
 */
export const GROWTH_UPSELL_SENT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
