import type { MetadataRoute } from "next";
import { getLeads } from "@/lib/db";
import { DEMO_LEADS } from "@/lib/leads/demo-catalog";
import { siteUrl } from "@/lib/seo";

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
  const slugs = new Set<string>(DEMO_LEADS.map((lead) => lead.slug));
  for (const lead of dbLeads) slugs.add(lead.slug);

  const previewEntries: MetadataRoute.Sitemap = Array.from(slugs).map((slug) => ({
    url: `${base}/preview/${slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...previewEntries];
}
