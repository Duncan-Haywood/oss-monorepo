import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * `baseUrl` used to fall back to `https://printatelier.com` — see
 * `src/lib/site-url.ts` for why that is a domain this venture does not serve.
 *
 * With no configured origin there is no honest robots.txt to write: a
 * `sitemap:` line would point at a host we cannot name, and an `allow` would
 * invite crawlers to index a deployment that does not know its own address.
 * So an unconfigured build disallows everything. Being absent from search
 * results until someone sets the variable is the recoverable failure; being
 * indexed under another party's domain is not.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveSiteUrl();

  if (baseUrl === null) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin-portal", "/ops"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
