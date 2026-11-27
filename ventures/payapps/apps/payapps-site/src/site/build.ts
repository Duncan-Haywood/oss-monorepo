// Builds every generated file of the site in memory: path (relative to the base-path directory) →
// contents. Pure, so the unit tests check exactly what scripts/build.ts writes.
import { pageKeys } from "@shared/site";
import { pageShell, type SiteContext } from "./html";
import { launchOf } from "./launch";
import { type BuiltPage, buildPage } from "./pages";
import { feedXml, llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from "./seo";

export function buildSite(ctx: SiteContext): Map<string, string> {
  if (ctx.staticHost && !launchOf(ctx).open) {
    throw new Error(
      "A static-host build needs APP_URL: before launch the early-access form needs the Worker",
    );
  }
  const files = new Map<string, string>();
  const built: BuiltPage[] = pageKeys(ctx).map((k) => buildPage(ctx, k));
  for (const b of built) {
    // On the catalogue its chrome writes the BreadcrumbList that matches the trail it shows
    // (platform/pages/build.mjs, injectChrome), and it skips a page that already names one.
    const jsonLd = ctx.staticHost
      ? b.jsonLd.filter((n) => n["@type"] !== "BreadcrumbList")
      : b.jsonLd;
    files.set(b.page.file, pageShell(ctx, { page: b.page, main: b.main, jsonLd }));
  }
  files.set("sitemap.xml", sitemapXml(ctx));
  files.set("robots.txt", robotsTxt(ctx));
  files.set("llms.txt", llmsTxt(ctx));
  files.set("llms-full.txt", llmsFullTxt(ctx, built));
  files.set("feed.xml", feedXml(ctx));
  return files;
}
