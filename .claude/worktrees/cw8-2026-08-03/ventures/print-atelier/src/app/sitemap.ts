import { buildSitemapEntries } from "@/lib/seo";
import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://printatelier.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return buildSitemapEntries().map((entry) => ({
    url: `${baseUrl.replace(/\/$/, "")}${entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
