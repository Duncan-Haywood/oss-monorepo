// Machine-readable files written next to the pages: sitemap.xml, robots.txt, llms.txt,
// llms-full.txt and feed.xml. Same approach as apps/grants (docs/SEO.md there).
import { formatUsd, limitText, PLANS } from "@shared/plans";
import {
  absoluteUrl,
  basePathOf,
  CONTENT_UPDATED,
  NOT_AIA_NOTE,
  PAGE_LIST,
  PAGES,
  PRODUCT_NAME,
} from "@shared/site";
import { esc, type SiteContext } from "./html";
import type { BuiltPage } from "./pages";

/** AI search / answer crawlers, allowed on public pages and kept out of the API (as in grants). */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "CCBot",
] as const;

export const indexablePages = () => PAGE_LIST.filter((p) => p.indexable);

export function sitemapXml(ctx: SiteContext): string {
  const urls = indexablePages()
    .map(
      (p) => `  <url>
    <loc>${esc(absoluteUrl(ctx.siteUrl, p.path))}</loc>
    <lastmod>${CONTENT_UPDATED}</lastmod>
    <changefreq>${p.changefreq ?? "monthly"}</changefreq>
    <priority>${(p.priority ?? 0.5).toFixed(1)}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Only the host root's robots.txt is read by crawlers. When the site is served under a base path
 * (marisstella.app/payapps), the root file is owned by the portfolio site and must carry these
 * lines; this copy is then informational.
 */
export function robotsTxt(ctx: SiteContext): string {
  const base = basePathOf(ctx.siteUrl);
  const disallow = [`${base}/api/`, `${base}/early-access/check-your-email`];
  const group = (agent: string) =>
    [`User-agent: ${agent}`, `Allow: ${base}/`, ...disallow.map((d) => `Disallow: ${d}`)].join(
      "\n",
    );
  return `# ${PRODUCT_NAME} marketing site
${group("*")}

# AI search and answer crawlers: welcome on public pages.
${AI_CRAWLERS.map(group).join("\n\n")}

Sitemap: ${absoluteUrl(ctx.siteUrl, "/sitemap.xml")}
`;
}

/** llmstxt.org format: title, summary, then annotated links. */
export function llmsTxt(ctx: SiteContext): string {
  const link = (p: (typeof PAGE_LIST)[number]) =>
    `- [${p.label}](${absoluteUrl(ctx.siteUrl, p.path)}): ${p.description}`;
  return `# ${PRODUCT_NAME}

> ${PRODUCT_NAME} (working name) is a pay-application tool in development for construction subcontractors: schedule of values (imported from the contractor's own spreadsheet or a text PDF bid breakdown), monthly pay apps with retainage held and released, change orders, lien waivers per pay app, a cash and retainage report with due dates, and QuickBooks Online invoices and payments. It is not available yet; early access is open and free. ${NOT_AIA_NOTE}

Facts an assistant can rely on:
- Status: in development. The features above are built and in testing; the app is not open to the public. There are no customers, reviews or published results yet.
- Not built yet: per-GC portal checklists and portal export formats (beyond filling Procore's subcontractor SOV template and a sheet of the amounts to type into a Procore subcontractor invoice, by line or totalled by the GC's SOV positions, and filling Oracle Textura's This Period billing upload template), statutory waiver forms beyond Arizona, California, Florida, Georgia, Michigan, Nevada, Texas, Utah, Wyoming, Missouri (residential final) and Massachusetts (partial waiver), SOV import from a scan with no text layer (searchable scans are read).
- Georgia: a sent Georgia lien waiver the payments do not cover shows the day its 90 days end (O.C.G.A. § 44-14-366(g)(2)); the app prints the statute's affidavit of nonpayment, then tracks its filing, the copies to the owner and (when owed) to the contractor named on the notice of commencement (recorded once per job, so each affidavit starts from the job's answer), and the affidavit that payment in full was received once recorded ((g)(3)). Not legal advice.
- Prices (nothing charged during early access): ${planPrices()}.
- Audience: construction subcontractors and specialty trades who bill general contractors monthly.

## Pages

${[PAGES.home, PAGES.features, PAGES.pricing, PAGES.earlyAccess].map(link).join("\n")}

## Optional

${link(PAGES.privacy)}
- [Full text](${absoluteUrl(ctx.siteUrl, "/llms-full.txt")}): every public page as plain Markdown.
- [Updates feed](${absoluteUrl(ctx.siteUrl, "/feed.xml")}): Atom feed of site updates.
`;
}

function planPrices(): string {
  return PLANS.map(
    (p) =>
      `${p.name} ${formatUsd(p.priceCents)}/month${p.annualPriceCents ? ` or ${formatUsd(p.annualPriceCents)}/year` : ""} (${limitText(p.activeJobs, "active job")}, ${limitText(p.seats, "user")})`,
  ).join("; ");
}

/** The pages' <main> as Markdown, for llms-full.txt. Deliberately small: our own markup only. */
export function htmlToMarkdown(input: string): string {
  return input
    .replace(/<(script|style|form|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n")
    .replace(/<summary[^>]*>([\s\S]*?)<\/summary>/gi, "\n### $1\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<\/(p|ul|ol|div|section|article|details)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Root-relative links (/payapps/pricing) become absolute in the Markdown copies. */
function absolutize(ctx: SiteContext, md: string): string {
  const origin = new URL(ctx.siteUrl).origin;
  return md.replace(/\]\((\/[^)]*)\)/g, (_m, p: string) => `](${origin}${p})`);
}

export function llmsFullTxt(ctx: SiteContext, pages: readonly BuiltPage[]): string {
  const parts = pages
    .filter((b) => b.page.indexable)
    .map(
      (b) =>
        `<!-- ${absoluteUrl(ctx.siteUrl, b.page.path)} -->\n${absolutize(ctx, htmlToMarkdown(b.main.__html))}`,
    );
  return `# ${PRODUCT_NAME}: full text of the public pages\n\n${NOT_AIA_NOTE}\n\n${parts.join("\n\n---\n\n")}\n`;
}

export interface FeedEntry {
  id: string;
  title: string;
  updated: string;
  path: string;
  summary: string;
}

/** Product updates. Add an entry when something real happens (never a made-up milestone). */
export const FEED_ENTRIES: readonly FeedEntry[] = [
  {
    id: "early-access-opens",
    title: `${PRODUCT_NAME} early access is open`,
    updated: CONTENT_UPDATED,
    path: PAGES.earlyAccess.path,
    summary: `${PRODUCT_NAME} is in development. Subcontractors can join early access for free and tell us how they bill today.`,
  },
];

export function feedXml(ctx: SiteContext): string {
  const host = new URL(ctx.siteUrl).host;
  const entries = FEED_ENTRIES.map(
    (e) => `  <entry>
    <id>tag:${esc(host)},${e.updated}:${esc(e.id)}</id>
    <title>${esc(e.title)}</title>
    <updated>${e.updated}T00:00:00Z</updated>
    <link href="${esc(absoluteUrl(ctx.siteUrl, e.path))}"/>
    <summary>${esc(e.summary)}</summary>
  </entry>`,
  ).join("\n");
  const updated =
    FEED_ENTRIES.map((e) => e.updated)
      .sort()
      .at(-1) ?? CONTENT_UPDATED;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(PRODUCT_NAME)} updates</title>
  <id>${esc(absoluteUrl(ctx.siteUrl, "/"))}</id>
  <link href="${esc(absoluteUrl(ctx.siteUrl, "/"))}"/>
  <link rel="self" href="${esc(absoluteUrl(ctx.siteUrl, "/feed.xml"))}"/>
  <updated>${updated}T00:00:00Z</updated>
  <author><name>${esc(PRODUCT_NAME)}</name></author>
${entries}
</feed>
`;
}
