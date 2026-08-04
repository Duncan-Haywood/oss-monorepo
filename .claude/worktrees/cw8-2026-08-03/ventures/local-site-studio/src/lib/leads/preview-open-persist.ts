import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Preview-open beacon success policy for outreach attribution.
 *
 * When Convex is configured, POST /api/preview/[slug]/open must pass
 * PREVIEW_OPEN_CONVEX_PRIMARY so a Convex mutation failure returns 503
 * instead of writing only to instance-local SQLite (dashboard/other
 * instances read Convex-first and would never see lastPreviewOpenAt —
 * Work next scoring, follow-up openers-first sort, and the Opened badge
 * silently regress).
 *
 * The client beacon is fire-and-forget; 503 is acceptable (no UX claim of
 * success). Same class of fix as CONTACT_FORM_CONVEX_PRIMARY /
 * UNSUBSCRIBE_CONVEX_PRIMARY.
 */

/** Fail-closed write options for public preview-open attribution writes. */
export const PREVIEW_OPEN_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
