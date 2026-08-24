import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for the Starter upsell sent-marker
 * (recordStarterUpsellSent).
 *
 * getLeads / getLeadBySlug read Convex-first, so sendStarterUpsellAction must
 * pass STARTER_UPSELL_SENT_CONVEX_PRIMARY so a Convex mutation failure surfaces
 * to the operator instead of silently landing only in instance-local SQLite —
 * a split-brain count would defeat the CAS guard's whole purpose on the next
 * request routed to a different instance. Mirrors CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY's
 * count-based CAS shape (not MARKETING_PACK_CONVEX_PRIMARY's one-shot gate):
 * this marker does not block a later, deliberate resend, only an exact
 * concurrent duplicate (see starter-upsell-send-race-guard).
 */
export const STARTER_UPSELL_SENT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
