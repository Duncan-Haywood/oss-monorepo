// Builds the whole public site as a map of file path → contents. Pure (no file system), so the unit
// tests check exactly what scripts/build.ts writes to dist/. Mirrors apps/grants' prerender outputs:
// per-page HTML with JSON-LD, sitemap.xml, robots.txt (named AI crawlers), llms.txt, llms-full.txt.

import { EARLY_ACCESS_PLAN, PLANS } from "@shared/plans";
import {
  appLink,
  CONTACT_EMAIL,
  DEFAULT_SITE_URL,
  LAUNCH,
  type Launch,
  PUBLISHER,
  SITE_NAME,
  TAGLINE,
} from "./config";
import { canonical, type DocumentContext, renderDocument } from "./layout";
import { faqs, PAGE_BODIES } from "./pages";
import { type PublicRoute, publicRoutes } from "./routes";

/** Same list as apps/grants: named so the policy is explicit; each group repeats the "*" rules. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "CCBot",
] as const;
const DISALLOWED = ["/api", "/early-access/thanks"];
const OPEN_DISALLOWED = ["/api"];

export function jsonLdFor(ctx: DocumentContext, route: PublicRoute): unknown {
  const orgId = `${ctx.siteUrl}/#organization`;
  const siteId = `${ctx.siteUrl}/#website`;
  const url = canonical(ctx, route.path);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: route.title,
      description: route.description,
      inLanguage: "en-US",
      isPartOf: { "@id": siteId },
      publisher: { "@id": orgId },
      dateModified: route.lastmod,
    },
  ];
  if (route.path !== "/") {
    const crumbs: { name: string; path: string }[] = [{ name: "Home", path: "/" }];
    const parent = route.path.replace(/\/[^/]+$/, "");
    const parentRoute = parent
      ? publicRoutes(ctx.launch).find((r) => r.path === parent)
      : undefined;
    if (parentRoute) crumbs.push({ name: parentRoute.label, path: parentRoute.path });
    crumbs.push({ name: route.label, path: route.path });
    (graph[0] as Record<string, unknown>).breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: canonical(ctx, c.path),
      })),
    });
  }
  const kinds = route.structuredData ?? [];
  if (kinds.includes("organization")) {
    graph.push({
      "@type": "Organization",
      "@id": orgId,
      name: PUBLISHER,
      url: `${ctx.siteUrl}/`,
      logo: `${ctx.siteUrl}/favicon.svg`,
      email: CONTACT_EMAIL,
    });
  }
  if (kinds.includes("website")) {
    graph.push({
      "@type": "WebSite",
      "@id": siteId,
      name: SITE_NAME,
      url: `${ctx.siteUrl}/`,
      inLanguage: "en-US",
      publisher: { "@id": orgId },
    });
  }
  if (kinds.includes("software")) {
    // Open: the free plan is the only offer (paid plans are not on sale). Closed: no offers at all.
    // Never ratings: there are no reviews.
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${ctx.siteUrl}/#software`,
      name: SITE_NAME,
      description: route.description,
      url: `${ctx.siteUrl}/`,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Manufacturing quoting",
      operatingSystem: "Web browser",
      publisher: { "@id": orgId },
      ...(ctx.launch.open
        ? {
            offers: [
              {
                "@type": "Offer",
                name: EARLY_ACCESS_PLAN.name,
                price: "0",
                priceCurrency: "USD",
                url: appLink(ctx.launch, "/sign-up"),
              },
            ],
          }
        : { creativeWorkStatus: "In development" }),
      audience: {
        "@type": "BusinessAudience",
        audienceType: "CNC machine shops and metal fabrication job shops",
      },
    });
  }
  if (kinds.includes("product")) {
    // Proposed prices are shown on the page but not offered for sale, so only the free early-access
    // offer is marked up (availability PreOrder would also overstate it).
    graph.push({
      "@type": "Product",
      "@id": `${url}#product`,
      name: SITE_NAME,
      description: ctx.launch.open
        ? `${TAGLINE}. Free to start on the Early access plan.`
        : `${TAGLINE}. In development; early access is free.`,
      brand: { "@type": "Brand", name: SITE_NAME },
      offers: [
        ctx.launch.open
          ? {
              "@type": "Offer",
              name: EARLY_ACCESS_PLAN.name,
              price: "0",
              priceCurrency: "USD",
              url: appLink(ctx.launch, "/sign-up"),
              availability: "https://schema.org/InStock",
              description: `Free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, no card.`,
            }
          : {
              "@type": "Offer",
              name: EARLY_ACCESS_PLAN.name,
              price: "0",
              priceCurrency: "USD",
              url: canonical(ctx, "/early-access"),
              availability: "https://schema.org/LimitedAvailability",
              description: `Free while in development, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month.`,
            },
      ],
    });
  }
  if (kinds.includes("faq")) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faqs(ctx.launch).map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** Output file for a route ("file" layout, served 200 under html_handling auto-trailing-slash). */
export const fileFor = (path: string): string =>
  path === "/" ? "index.html" : `${path.replace(/^\/+|\/+$/g, "")}.html`;

export function renderPage(ctx: DocumentContext, route: PublicRoute): string {
  const body = PAGE_BODIES[route.path];
  if (!body) throw new Error(`No page body for ${route.path}`);
  return renderDocument(ctx, route, body(ctx), jsonLdFor(ctx, route));
}

/** `s` with `re` replaced until nothing matches, so a removal cannot leave a new match behind. */
function replaceAll(s: string, re: RegExp, by: string): string {
  let prev: string;
  let out = s;
  do {
    prev = out;
    out = out.replace(re, by);
  } while (out !== prev);
  return out;
}

/** Visible text of the <main> element, for llms-full.txt (plain text, never served as HTML). */
export function mainText(page: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(page)?.[1] ?? "";
  const blocks = replaceAll(
    replaceAll(main, /<form\b[\s\S]*?<\/form>/g, " "),
    /<(figure|svg)\b[\s\S]*?<\/\1>/g,
    " ",
  );
  return replaceAll(
    blocks
      .replace(/<\/(h[1-6])>/g, "\n\n")
      .replace(/<h([1-6])\b[^>]*>/g, (_, n: string) => `\n\n${"#".repeat(Number(n) + 1)} `)
      .replace(/<li\b[^>]*>/g, "\n- ")
      .replace(/<summary\b[^>]*>/g, "\n\n### ")
      .replace(/<\/summary>/g, "\n\n")
      .replace(/<\/(p|ul|ol|section|div)>/g, "\n\n"),
    /<[^>]+>/g,
    "",
  )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sitemap(ctx: DocumentContext): string {
  const urls = publicRoutes(ctx.launch)
    .filter((r) => !r.noindex)
    .map((r) =>
      [
        "  <url>",
        `    <loc>${canonical(ctx, r.path)}</loc>`,
        `    <lastmod>${r.lastmod}</lastmod>`,
        `    <changefreq>${r.changefreq}</changefreq>`,
        `    <priority>${r.priority.toFixed(1)}</priority>`,
        "  </url>",
      ].join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by scripts/build.ts from PUBLIC_ROUTES (src/site/routes.ts). -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Crawlers only read /robots.txt at the host root. Under a base path this copy is the reference for
 * the lines the host's own robots.txt must carry (as for apps/grants).
 */
export function robots(ctx: DocumentContext): string {
  const rules = [
    `Allow: ${ctx.basePath}/`,
    ...(ctx.launch.open ? OPEN_DISALLOWED : DISALLOWED).map((d) => `Disallow: ${ctx.basePath}${d}`),
  ];
  return [
    "# Generated by scripts/build.ts.",
    ...(ctx.basePath
      ? [
          `# Served at ${ctx.basePath}/robots.txt: the host's own /robots.txt must carry these lines.`,
        ]
      : []),
    "# Public pages may be crawled, indexed and cited by search and AI answer engines.",
    `# A plain-text summary for language models: ${ctx.siteUrl}/llms.txt`,
    "User-agent: *",
    ...rules,
    "",
    ...AI_CRAWLERS.flatMap((bot) => [`User-agent: ${bot}`, ...rules, ""]),
    `Sitemap: ${ctx.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

function summary(launch: Launch): string {
  if (!launch.open) return CLOSED_SUMMARY;
  const off = [
    launch.aiReading ? "" : "reading RFQ emails and PDF drawings with AI",
    launch.inboundEmail ? "" : "RFQs forwarded by email",
    launch.paidPlans ? "" : "paid plans",
    "the QuickBooks Online connection",
  ].filter(Boolean);
  return `${SITE_NAME} is a hosted web app for CNC machine shops and metal fabrication job shops, open for sign-up at ${appLink(launch, "/sign-up")}. A shop sets up its rate card (machine and setup rates, material priced by weight, piece or length, outside processing, markups, minimums and quantity breaks), adds an RFQ's parts and files, and gets each line priced only from those rates, with setup and cycle times from its routings and from STEP and DXF measurements that the estimator can correct. It builds the quote PDF, emails it when the estimator sends it, gives the customer a link to accept or decline, reminds about follow-ups and expiring quotes, prints job travelers and keeps a won/lost log. An estimator at the shop reviews and sends every quote; the product never sends quotes itself. The Early access plan is free (up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, ${EARLY_ACCESS_PLAN.seats} people, no card). Built but not switched on in the hosted app yet: ${off.join(", ")}. It has no customers yet. It is not set up for CUI or export-controlled (ITAR/EAR) drawings.`;
}

const CLOSED_SUMMARY = `${SITE_NAME} is a web app in development for CNC machine shops and metal fabrication job shops. It reads request-for-quote (RFQ) emails and PDF drawings, extracts parts, quantities, materials, tolerances and finishes, checks each extracted value against the drawing and flags anything it cannot confirm, and drafts a quote priced only from the shop's own rate table (machine rates, setup charges, material, outside processing, minimums). An estimator at the shop reviews and sends every quote; the product never sends quotes itself. It has no customers yet; early access is free and nothing is for sale. It is not set up for CUI or export-controlled (ITAR/EAR) drawings during early access.`;

export function llmsTxt(ctx: DocumentContext): string {
  const routes = publicRoutes(ctx.launch);
  const listed = routes.filter((r) => !r.noindex);
  const home = routes.find((r) => r.path === "/");
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${home?.description ?? TAGLINE}`,
    "",
    summary(ctx.launch),
    "",
    `${ctx.launch.paidPlans ? "Paid plans" : ctx.launch.open ? "Paid plans (not on sale yet)" : "Proposed plans (not on sale)"}: ${PLANS.map((p) => `${p.name} $${p.monthlyPrice}/month for up to ${p.rfqsPerMonth} RFQs`).join("; ")}. When citing pricing or status, link the pages below rather than restating figures, since they can change.`,
    "",
    "## Pages",
    "",
    ...listed.map((r) => `- [${r.label}](${canonical(ctx, r.path)}): ${r.description}`),
    "",
    "## Optional",
    "",
    `- [Full text of every page](${ctx.siteUrl}/llms-full.txt): the pages above as plain text.`,
    ...(ctx.launch.open
      ? [`- [Sign up](${appLink(ctx.launch, "/sign-up")}): the app itself.`]
      : []),
    `- Contact: ${CONTACT_EMAIL} (${PUBLISHER})`,
    "",
  ].join("\n");
}

export function llmsFullTxt(ctx: DocumentContext, pages: Map<string, string>): string {
  const parts = [`# ${SITE_NAME}: full text`, "", summary(ctx.launch), ""];
  for (const r of publicRoutes(ctx.launch).filter((x) => !x.noindex)) {
    const page = pages.get(r.path);
    if (!page) continue;
    parts.push(`## ${r.label}`, "", `Source: ${canonical(ctx, r.path)}`, "", mainText(page), "");
  }
  return `${parts.join("\n").trim()}\n`;
}

export interface BuildOptions {
  siteUrl: string;
  basePath: string;
  /** What the hosted app does today; LAUNCH (./config) when left out. */
  launch?: Launch;
}

/** Every generated file, keyed by its path inside dist/. Static files in public/ are copied separately. */
export function buildSite(opts: BuildOptions): Map<string, string> {
  const launch = opts.launch ?? LAUNCH;
  const ctx: DocumentContext = { siteUrl: opts.siteUrl, basePath: opts.basePath, launch };
  const files = new Map<string, string>();
  const pages = new Map<string, string>();
  const titles = new Set<string>();
  for (const route of publicRoutes(launch)) {
    if (titles.has(route.title)) throw new Error(`Duplicate title: ${route.title}`);
    titles.add(route.title);
    const page = renderPage(ctx, route);
    pages.set(route.path, page);
    files.set(fileFor(route.path), page);
  }
  files.set("sitemap.xml", sitemap(ctx));
  files.set("robots.txt", robots(ctx));
  files.set("llms.txt", llmsTxt(ctx));
  files.set("llms-full.txt", llmsFullTxt(ctx, pages));
  return files;
}

/** Normalises env SITE_URL / BASE_PATH the way apps/grants' prerender does. */
export function resolveBuildOptions(env: {
  SITE_URL?: string | undefined;
  BASE_PATH?: string | undefined;
}): BuildOptions {
  const siteUrl = (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+(?:\/[A-Za-z0-9._~-]+)*$/.test(siteUrl))
    throw new Error(`SITE_URL must be an origin with an optional path, got ${env.SITE_URL}`);
  const segments = (env.BASE_PATH ?? "").split("/").filter(Boolean);
  if (segments.some((s) => !/^[A-Za-z0-9._~-]+$/.test(s) || s === "." || s === ".."))
    throw new Error(`BASE_PATH must be a plain path like /jobshop, got ${env.BASE_PATH}`);
  return { siteUrl, basePath: segments.length ? `/${segments.join("/")}` : "" };
}
