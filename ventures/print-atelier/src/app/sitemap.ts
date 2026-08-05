import { buildSitemapEntries } from "@/lib/seo";
import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Sitemap entries are absolute URLs by specification, so without a configured
 * origin every entry this file could produce would advertise a host the
 * business may not own — see `src/lib/site-url.ts`.
 *
 * An empty sitemap is the fail-closed answer: it is valid, it publishes
 * nothing, and it is trivially reversible by setting the variable and
 * rebuilding. `robots.ts` disallows crawling in the same state, so the two
 * agree rather than one inviting crawlers the other cannot serve.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = resolveSiteUrl();

  if (baseUrl === null) {
    return [];
  }

  const lastModified = new Date();

  return buildSitemapEntries().map((entry) => ({
    url: `${baseUrl}${entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
