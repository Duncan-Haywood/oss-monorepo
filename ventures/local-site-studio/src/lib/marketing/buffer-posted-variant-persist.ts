import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for a lead's bufferPostedVariantKeys
 * (updateLeadBufferPostedVariantKeys).
 *
 * getLeadBySlug reads Convex-first. scheduleMarketingPackToBufferAction must
 * pass LEAD_BUFFER_POSTED_VARIANT_KEYS_CONVEX_PRIMARY so a Convex mutation
 * failure never silently writes the just-posted variant's idempotency marker
 * only to instance-local SQLite — a Convex-first reader (this same action on
 * its next invocation, on any instance) would never see it and could re-post
 * the same content to the client's live Buffer/Facebook/Instagram profile, an
 * external side effect that can't be undone. The call site already treats
 * any thrown error here (including ConvexPrimaryWriteError) as "log and move
 * on" rather than a reported failure, since the Buffer post itself already
 * succeeded — failing closed only removes the split-brain window, it does
 * not change the caller's existing graceful-degradation behavior.
 *
 * Mirrors LEAD_BUFFER_PROFILES_CONVEX_PRIMARY (buffer-profiles-persist.ts).
 */
export const LEAD_BUFFER_POSTED_VARIANT_KEYS_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
