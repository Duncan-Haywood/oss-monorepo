import type { MetadataRoute } from "next";
import { getLeads } from "@/lib/db";
import { DEMO_LEADS } from "@/lib/leads/demo-catalog";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { isLeadPreviewIndexable, siteUrl } from "@/lib/seo";

const STATIC_ROUTES = [
  "",
  "/checkout",
  "/docs",
  "/docs/product-bundles",
  "/docs/business-model",
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
