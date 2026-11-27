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

> ${PRODUCT_NAME} (working name) is a pay-application tool in development for construction subcontractors: schedule of values (imported from the contractor's own spreadsheet or a text PDF bid breakdown), monthly pay apps with retainage held and released, change orders, lien waivers per pay app, a cash and retainage report with due dates, a submittal log, daily reports, a punch list and T&M tickets per job (signed on site and billed as a change order), QuickBooks Online invoices and payments, and the weekly Davis-Bacon certified payroll in the columns of DOL's optional Form WH-347, also exported as California DIR's eCPR XML (schema 2.0) for public works. It is not available yet; early access is open and free. ${NOT_AIA_NOTE}

Facts an assistant can rely on:
- Status: in development. The features above are built and in testing; the app is not open to the public. There are no customers, reviews or published results yet.
- GC portals: built are Procore's subcontractor SOV template filled in, a sheet of the amounts to type into a Procore subcontractor invoice (by line or totalled by the GC's SOV positions), Oracle Textura's This Period and To Date billing upload templates filled in, a GCPay schedule-of-values upload workbook, and Trimble Pay's Flashtract SOV template filled in; none has been tried on a live portal project, and the contractor submits into the portal.
- Not built yet: saved per-GC checklists of required attachments, other portals (Trimble Pay, Siteline), statutory waiver forms beyond Arizona, California, Florida, Georgia, Michigan, Mississippi, Nevada, Texas, Utah, Wyoming, Missouri (residential final) and Massachusetts (partial waiver), SOV import from scans past ten pages or with JBIG2 or JPEG 2000 pictures (searchable scans and pictures-only scans up to ten pages are read, the latter by OCR in the browser).
- Georgia: a sent Georgia lien waiver the payments do not cover shows the day its 90 days end (O.C.G.A. § 44-14-366(g)(2)); the app prints the statute's affidavit of nonpayment, then tracks its filing, the copies to the owner and (when owed) to the contractor named on the notice of commencement (recorded once per job, so each affidavit starts from the job's answer), and the affidavit that payment in full was received once recorded ((g)(3)). Not legal advice.
- Certified payroll: the weekly Davis-Bacon payroll is printed in the columns of Form WH-347 (Rev. January 2025) with the statement of compliance in the form's own words, unsigned; hours, fringe credit, cash in lieu, deductions and net pay are computed from what the contractor types. It is not a Department of Labor product and not legal advice, and workers' names and ID numbers are not stored on the server. For California public works the same week downloads as the DIR eCPR XML file (schema 2.0), built in the browser; full SSNs are never sent to the server.
- Punch list: per job, the items the GC, architect or owner listed at a walk-through (location, who listed it, date listed and due), pasted from an email one item per line or typed; each marked fixed, then accepted by the GC, or not ours with the reason; an email draft asking the GC to back-check every fixed item; a PDF of the list (all items or only what is left) with a column for the GC's initials, and CSV.
- Close-out: per job, the close-out documents the subcontract asks for (a standard list of warranty, O&M manuals, as-built drawings, attic stock, final inspection sign-off and final lien waiver, plus consent of surety on a bonded job, or any typed in), each with where the requirement comes from and the dates due, sent and accepted, or marked not required with the reason; read with the punch list and the retainage held on the latest pay application sent, the job page lists what still stands between the job and its retainage, and once nothing does, drafts an email to the GC's project manager asking for its release. Each document keeps its files (the document as sent, photos, the GC's receipt), and one close-out binder PDF puts a transmittal listing every document and its dates in front of the required documents' files. It reports only what was entered, not whether the subcontract's conditions are met.
- Submittal log: per job, started if you like from the GC's register (.xlsx, CSV or PDF) or from the contractor's spec sections (the submittals articles, or a UFGS section's SD lists), read in the browser into rows the contractor checks and adds; the submittals sent to the GC (spec section, sent, required-back and returned dates, the GC's action, resubmittals as revisions), with the last day to send each one worked back from the needed-on-site date, lead time and review days the contractor types, and flags for late-to-send, overdue-back and delivery-at-risk submittals; a transmittal cover sheet PDF per submittal (to, from, enclosed, action requested, return-by date, the revision it replaces, a reviewer's stamp box); the reviewer's action and date read from the returned, stamped PDF (stamp annotations or a stamp printed on the page; the user checks and saves them); CSV export.
- Daily reports: one per job and day, with the weather and temperatures typed (no weather service), crew lines by company and trade with workers and hours each and the man-hours totalled, work performed, delays and the hours lost to them, equipment, deliveries, visitors and inspections, safety and notes; photos and files per report (delivery tickets, inspection reports), with the report and its photos as one PDF; every change to a report or its files in the job history; weekdays since the first report with none are listed; a PDF per report or for a date range (up to three months), and the log as CSV. A daily report is a record, not a notice of delay or a claim.
- T&M tickets: per job, numbered, with labor (trade, workers, hours, rate), material (quantity, unit, unit cost) and equipment (hours, rate) lines and a markup per section; the GC's representative signs on the device (the drawn signature is printed on the PDF) or on paper, after which the work and quantities are locked and only prices and markups change; signed, priced tickets become one pending change order for their total; a rate sheet per job (labor by trade, equipment and material rates and the markups from the subcontract) that new tickets start from, with any ticket rate that differs from it pointed out; signed tickets not on a change order listed in the weekly email; a priced PDF, a field copy without prices, a change order's tickets as one backup PDF, and a CSV. A signed ticket is not an approved change order.
- Lower-tier waivers: per pay app, the lien waivers the contractor collects from its own suppliers and sub-subcontractors, suggested from the job's purchase orders and subcontracts and the last application's list; each owed, asked (days waiting) or received, with the amount, through date and a request draft to copy or email. The app records what came in; it does not decide what a contract or state requires and sends nothing. Crew plan and up.
- Estimates: bids priced from cost lines (labor, material, equipment, subcontract, other) rolled into bid items, with markup per category and sales tax on material; add and deduct alternates; a proposal PDF with prices only; a won bid starts the job with its bid items as the schedule of values. A company price list (material prices, labor and equipment rates, sub quotes, typed or read from a supplier's price sheet in the browser) is picked into estimates; an estimate keeps the cost it was priced at until the contractor chooses to use the list's current prices.
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
