import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for Growth/Complete marketing pack persist
 * (upsertMarketingPack).
 *
 * getMarketingPack / listMarketingPacksForMonth / listMarketingPacksDue
 * (pipeline-health + digest Marketing packs due + Email pack precondition)
 * all read Convex-first. generateMarketingPackAction must pass
 * MARKETING_PACK_CONVEX_PRIMARY so a Convex mutation failure surfaces to the
 * operator instead of claiming Generate pack success after a SQLite-only
 * write — otherwise other instances still show packs-due debt and Email pack
 * cannot find the row.
 *
 * Mirrors COMMERCE_CATALOG_CONVEX_PRIMARY / LEAD_NOTES_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Regenerating the same
 * UTC month is an idempotent replace.
 */

/** Fail-closed write options for marketing_packs upserts. */
export const MARKETING_PACK_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
