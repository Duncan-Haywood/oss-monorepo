// Builds every generated file of the site in memory: path (relative to the base-path directory) →
// contents. Pure, so the unit tests check exactly what scripts/build.ts writes.
import { pageKeys } from "@shared/site";
import { hasEarlyAccess, pageShell, type SiteContext } from "./html";
import { type BuiltPage, buildPage } from "./pages";
import { feedXml, llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from "./seo";

export function buildSite(ctx: SiteContext): Map<string, string> {
  const files = new Map<string, string>();
  const built: BuiltPage[] = pageKeys(hasEarlyAccess(ctx)).map((k) => buildPage(ctx, k));
  for (const b of built) {
    files.set(b.page.file, pageShell(ctx, { page: b.page, main: b.main, jsonLd: b.jsonLd }));
  }
  files.set("sitemap.xml", sitemapXml(ctx));
  files.set("robots.txt", robotsTxt(ctx));
  files.set("llms.txt", llmsTxt(ctx));
  files.set("llms-full.txt", llmsFullTxt(ctx, built));
  files.set("feed.xml", feedXml(ctx));
  return files;
}
