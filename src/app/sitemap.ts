import type { MetadataRoute } from "next";
import { getLeads } from "@/lib/db";
import { DOCS_PAGES } from "@/lib/docs/routes";
import { DEMO_LEADS } from "@/lib/leads/demo-catalog";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { isLeadPreviewIndexable, siteUrl } from "@/lib/seo";

// Reads getLeads() (a live DB call), so it must not freeze at build time —
// without an explicit revalidate window Next.js prerenders this route once
// and never re-runs it, meaning any lead that goes paid/live after the last
// deploy stays invisible to search engines until the next code deploy ships
// (sitemap-static-freeze-revalidate, see AGENT_PROTOCOL in prompt_process.tsx).
export const revalidate = 3600;

// Docs sub-routes are derived from DOCS_PAGES (shared with src/app/docs/page.tsx)
// so a new /docs/* page can never again ship indexable-but-unlisted in the
// sitemap (sitemap-docs-route-sync — see AGENT_PROTOCOL in prompt_process.tsx).
const STATIC_ROUTES = [
  "",
  "/checkout",
  "/docs",
  ...DOCS_PAGES.map((page) => page.href),
  "/privacy",
  "/terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));

  const dbLeads = await getLeads();
  // Curated demo showcases are always indexable public samples. Real leads are
  // published only once they consent by buying / going live — a cold-prospected
  // business must not be invited into Google's index under our domain. See
  // isLeadPreviewIndexable + preview-indexing-consent-guard in /docs/process.
  const slugs = new Set<string>(DEMO_LEADS.map((lead) => lead.slug));
  for (const lead of dbLeads) {
    if (isLeadPreviewIndexable(lead, { isCuratedDemo: slugs.has(lead.slug) })) {
      slugs.add(lead.slug);
    }
  }

  const previewEntries: MetadataRoute.Sitemap = Array.from(slugs).map((slug) => ({
    url: leadPreviewAbsoluteUrl(base, slug),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...previewEntries];
}
