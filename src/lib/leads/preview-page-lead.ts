/**
 * Load the lead for the sold SSR preview page (`/preview/[slug]`).
 *
 * Contact API + preview-open already hard-reject path slugs over
 * MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH via isPublicLeadSlugPathLengthOk. The page
 * was the residual twin: uncapped params.slug still reached getLeadBySlug and
 * resolvePreviewLead (which mints a synthetic lead for any token, so an
 * over-long path still rendered a full preview + JSON-LD). Soft-cap would
 * change the lookup key — fail closed with null so the page can notFound()
 * before any CRM/demo/commerce work (preview-page-slug-path-length-cap).
 *
 * Defaults lazy-import `@/lib/db` so Vitest can exercise the pure length gate
 * without pulling the `server-only` db module (same pattern as other
 * injectable loaders).
 */

import { isPublicLeadSlugPathLengthOk } from "@/lib/leads/slug-path";
import type { Lead } from "@/lib/leads/types";

export type PreviewPageLeadDeps = {
  getLeadBySlug: (slug: string) => Promise<Lead | null>;
  resolvePreviewLead: (slug: string) => Lead;
};

async function defaultDeps(): Promise<PreviewPageLeadDeps> {
  const [{ getLeadBySlug }, { resolvePreviewLead }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/leads/demo-catalog"),
  ]);
  return { getLeadBySlug, resolvePreviewLead };
}

/**
 * Returns null when the path slug fails the shared public length gate
 * (caller should notFound). Otherwise CRM lead or slug-inferred demo lead.
 */
export async function loadPreviewPageLead(
  slug: string,
  deps?: PreviewPageLeadDeps,
): Promise<Lead | null> {
  if (!isPublicLeadSlugPathLengthOk(slug)) {
    return null;
  }
  const resolved = deps ?? (await defaultDeps());
  const dbLead = await resolved.getLeadBySlug(slug);
  return dbLead || resolved.resolvePreviewLead(slug);
}
