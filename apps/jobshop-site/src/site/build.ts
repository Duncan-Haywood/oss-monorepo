// Builds the whole public site as a map of file path → contents. Pure (no file system), so the unit
// tests check exactly what scripts/build.ts writes to dist/. Mirrors apps/grants' prerender outputs:
// per-page HTML with JSON-LD, sitemap.xml, robots.txt (named AI crawlers), llms.txt, llms-full.txt.

import { EARLY_ACCESS_PLAN, PLANS } from "@shared/plans";
import { CONTACT_EMAIL, DEFAULT_SITE_URL, PUBLISHER, SITE_NAME, TAGLINE } from "./config";
import { canonical, type DocumentContext, renderDocument } from "./layout";
import { FAQS, PAGE_BODIES } from "./pages";
import { PUBLIC_ROUTES, type PublicRoute } from "./routes";

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
    const parentRoute = parent ? PUBLIC_ROUTES.find((r) => r.path === parent) : undefined;
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
    // No offers: nothing is for sale yet. No ratings: there are no reviews.
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
      creativeWorkStatus: "In development",
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
      description: `${TAGLINE}. In development; early access is free.`,
      brand: { "@type": "Brand", name: SITE_NAME },
      offers: [
        {
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
      mainEntity: FAQS.map((f) => ({
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

/**
 * Replace every match of `pattern` until none is left. One pass is not enough when removing a
 * match splices a new one together ("<scr<b>ipt>" leaves "ipt>", "<<b>script>" leaves "<script>").
 */
export function removeAll(input: string, pattern: RegExp, replacement = ""): string {
  let out = input;
  let prev: string;
  do {
    prev = out;
    out = out.replace(pattern, replacement);
  } while (out !== prev);
  return out;
}

/** Visible text of the <main> element, for llms-full.txt. */
export function mainText(page: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(page)?.[1] ?? "";
  const blocks = removeAll(
    removeAll(main, /<form\b[\s\S]*?<\/form\s*>/gi, " "),
    /<(figure|svg)\b[\s\S]*?<\/\1\s*>/gi,
    " ",
  );
  const md = blocks
    .replace(/<\/(h[1-6])>/g, "\n\n")
    .replace(/<h([1-6])\b[^>]*>/g, (_, n: string) => `\n\n${"#".repeat(Number(n) + 1)} `)
    .replace(/<li\b[^>]*>/g, "\n- ")
    .replace(/<summary\b[^>]*>/g, "\n\n### ")
    .replace(/<\/summary>/g, "\n\n")
    .replace(/<\/(p|ul|ol|section|div)>/g, "\n\n");
  // Entities decode after every tag is gone, &amp; last, so "&amp;lt;" stays the text "&lt;".
  return removeAll(md, /<[^>]+>/g)
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
  const urls = PUBLIC_ROUTES.filter((r) => !r.noindex)
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
    ...DISALLOWED.map((d) => `Disallow: ${ctx.basePath}${d}`),
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

const SUMMARY = `${SITE_NAME} is a web app in development for CNC machine shops and metal fabrication job shops. It reads request-for-quote (RFQ) emails and PDF drawings, extracts parts, quantities, materials, tolerances and finishes, checks each extracted value against the drawing and flags anything it cannot confirm, and drafts a quote priced only from the shop's own rate table (machine rates, setup charges, material, outside processing, minimums). An estimator at the shop reviews and sends every quote; the product never sends quotes itself. It has no customers yet; early access is free and nothing is for sale. It is not set up for CUI or export-controlled (ITAR/EAR) drawings during early access.`;

export function llmsTxt(ctx: DocumentContext): string {
  const listed = PUBLIC_ROUTES.filter((r) => !r.noindex);
  const home = PUBLIC_ROUTES.find((r) => r.path === "/");
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${home?.description ?? TAGLINE}`,
    "",
    SUMMARY,
    "",
    `Proposed plans (not on sale): ${PLANS.map((p) => `${p.name} $${p.monthlyPrice}/month for up to ${p.rfqsPerMonth} RFQs`).join("; ")}. When citing pricing or status, link the pages below rather than restating figures, since they can change.`,
    "",
    "## Pages",
    "",
    ...listed.map((r) => `- [${r.label}](${canonical(ctx, r.path)}): ${r.description}`),
    "",
    "## Optional",
    "",
    `- [Full text of every page](${ctx.siteUrl}/llms-full.txt): the pages above as plain text.`,
    `- Contact: ${CONTACT_EMAIL} (${PUBLISHER})`,
    "",
  ].join("\n");
}

export function llmsFullTxt(ctx: DocumentContext, pages: Map<string, string>): string {
  const parts = [`# ${SITE_NAME}: full text`, "", SUMMARY, ""];
  for (const r of PUBLIC_ROUTES.filter((x) => !x.noindex)) {
    const page = pages.get(r.path);
    if (!page) continue;
    parts.push(`## ${r.label}`, "", `Source: ${canonical(ctx, r.path)}`, "", mainText(page), "");
  }
  return `${parts.join("\n").trim()}\n`;
}

export interface BuildOptions {
  siteUrl: string;
  basePath: string;
}

/** Every generated file, keyed by its path inside dist/. Static files in public/ are copied separately. */
export function buildSite(opts: BuildOptions): Map<string, string> {
  const ctx: DocumentContext = { siteUrl: opts.siteUrl, basePath: opts.basePath };
  const files = new Map<string, string>();
  const pages = new Map<string, string>();
  const titles = new Set<string>();
  for (const route of PUBLIC_ROUTES) {
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
