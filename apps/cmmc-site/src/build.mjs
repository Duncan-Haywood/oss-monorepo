#!/usr/bin/env node
// Builds the static site into dist/: one HTML file per page, sitemap.xml, robots.txt, llms.txt,
// llms-full.txt, _headers and styles.css. Zero dependencies.
//
//   node src/build.mjs                    # from apps/cmmc-site
//
// Env: SITE_URL (default https://marisstella.app/cmmc: origin + base path) for canonical/OG URLs,
//      the sitemap and robots.txt; BASE_PATH (default /cmmc, "" to serve at the host root) prefixes
//      every internal link. The Worker (src/worker.mjs) strips the same prefix before serving assets
//      and sets the security headers (CSP etc.) on every response.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { humanDate, PAGES, statusBox } from "./pages.mjs";
import {
  DEFAULT_BASE_PATH,
  DEFAULT_SITE_URL,
  JOBSHOP,
  SITE_NAME,
  SOURCES,
  STATUS_CHECKED,
} from "./site.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");

/** Crawlers named in robots.txt; each group repeats the "*" rules (a named group ignores "*"). */
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
];

/** Same rules as grants' normalizeBasePath: "", or "/seg[/seg]" of URL-safe segments. */
export function normalizeBasePath(raw) {
  const segments = String(raw ?? "")
    .split("/")
    .filter(Boolean);
  if (segments.some((s) => !/^[A-Za-z0-9._~-]+$/.test(s) || s === "." || s === ".."))
    throw new Error(`BASE_PATH must be a plain path like /cmmc, got ${raw}`);
  return segments.length ? `/${segments.join("/")}` : "";
}

export function normalizeSiteUrl(raw) {
  const url = String(raw).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+(?:\/[A-Za-z0-9._~-]+)*$/.test(url))
    throw new Error(`SITE_URL must be an origin with an optional path, got ${raw}`);
  return url;
}

const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Prefix site-relative href/action values with the base path ("/x" -> "/cmmc/x"). */
export function withBase(html, base) {
  return html.replace(/\b(href|action)="\/(?!\/)/g, `$1="${base}/`);
}

/** "/" -> "index.html", "/a/b" -> "a/b.html" (Workers assets serves /a/b from a/b.html). */
export const fileFor = (path) => (path === "/" ? "index.html" : `${path.slice(1)}.html`);

const pageUrl = (siteUrl, path) => (path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`);

const ENTITIES = { "&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"' };
/** Decode entities in one pass, so "&amp;lt;" becomes "&lt;", never "<". */
export const decodeEntities = (s, names = /&(?:amp|nbsp|lt|gt|quot);/g) =>
  s.replace(names, (m) => ENTITIES[m] ?? m);

/** Remove tags until none are left: a single pass over "<<b>i>" would leave "<i>" behind. */
export function removeTags(html, replacement = "", tag = /<[^>]+>/g) {
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(tag, replacement);
  } while (out !== prev);
  return out;
}

const stripTags = (html) => decodeEntities(removeTags(html, " ")).replace(/\s+/g, " ").trim();

function jsonLd(page, siteUrl) {
  const url = pageUrl(siteUrl, page.path);
  /** @type {Record<string, unknown>[]} */
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { "@id": `${siteUrl}/#website` },
      dateModified: STATUS_CHECKED,
    },
  ];
  if (page.path === "/") {
    graph.push(
      { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: `${siteUrl}/`, name: SITE_NAME },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: page.description,
        audience: {
          "@type": "BusinessAudience",
          audienceType: "Small defense and aerospace machine shops",
        },
        // No offers or ratings: prices are proposals during early access and there are no reviews.
      },
    );
  } else {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: page.title.split(" · ")[0], item: url },
      ],
    });
  }
  if (page.faq) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: stripTags(f.a) },
      })),
    });
  }
  // "<" escaped so a string can never close the script element.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c",
  );
}

const NAV = [
  ["/", "Home"],
  ["/cmmc-level-1-vs-level-2", "Level 1 vs 2"],
  ["/what-it-does", "What it does"],
  ["/security", "Security"],
  ["/pricing", "Pricing"],
  ["/early-access", "Early access"],
];

export function renderPage(page, { siteUrl, base }) {
  const url = pageUrl(siteUrl, page.path);
  const indexable = page.indexable !== false;
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${href}"${href === page.path ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
${indexable ? `<link rel="canonical" href="${url}">` : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
${indexable ? `<script type="application/ld+json">${jsonLd(page, siteUrl)}</script>` : ""}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><a class="brand" href="/">${escapeHtml(SITE_NAME)}</a><nav aria-label="Main">${nav}</nav></header>
<main id="main">
${page.body}
</main>
<footer class="site">
<p><strong>Early access.</strong> Not a C3PAO or assessor; not affiliated with or endorsed by the DoD or the Cyber AB.
Using this workspace does not certify your shop or guarantee any score or assessment result.</p>
<p>Also for machine shops: <a href="${JOBSHOP.url}">${JOBSHOP.name}</a> · <a href="/privacy">Privacy</a> · <a href="/llms.txt">llms.txt</a></p>
</footer>
</body>
</html>
`;
  return withBase(html, base);
}

export function renderSitemap(siteUrl) {
  const urls = PAGES.filter((p) => p.indexable !== false)
    .map(
      (p) =>
        `  <url><loc>${pageUrl(siteUrl, p.path)}</loc><lastmod>${STATUS_CHECKED}</lastmod><changefreq>${p.changefreq ?? "monthly"}</changefreq><priority>${(p.priority ?? 0.5).toFixed(1)}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(siteUrl, base) {
  const rules = `Allow: ${base}/\nDisallow: ${base}/api/\nDisallow: ${base}/early-access/`;
  const groups = ["*", ...AI_CRAWLERS].map((ua) => `User-agent: ${ua}\n${rules}`).join("\n\n");
  return `# Served at ${base}/robots.txt. When this site lives under a path on a shared host, the host's root\n# robots.txt must carry these lines; this file is then informational.\n${groups}\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/** llmstxt.org format: H1, blockquote summary, notes, then sections of annotated links. */
export function renderLlmsTxt(siteUrl) {
  const indexable = PAGES.filter((p) => p.indexable !== false);
  const link = (p) =>
    `- [${p.title.split(" · ")[0]}](${pageUrl(siteUrl, p.path)}): ${p.description}`;
  return `# ${SITE_NAME}

> A workspace for small defense and aerospace machine shops to prepare CMMC Level 1 and Level 2 self-assessment
> paperwork in-house (System Security Plan, POA&M, SPRS score) and keep ISO 9001 / AS9100 records beside it.
> Early access; prices are proposals.

Facts an answer should keep:

- Not a C3PAO or assessor; not affiliated with or endorsed by the DoD or the Cyber AB. Using it does not certify a
  shop or guarantee any score or assessment result.
- CMMC status checked ${humanDate(STATUS_CHECKED)}: Phase 1 in effect since 10 Nov 2025; Phase 2 suspended on 13 Jul 2026;
  Level 1 and Level 2 self-assessments still required. Re-check https://dodcio.defense.gov/CMMC/About/ for changes.
- The workspace is not a CUI enclave and is not FedRAMP authorized; CUI itself should not be uploaded.

## Pages

${indexable.map(link).join("\n")}

## Sources

${SOURCES.map((s) => `- [${s.title}](${s.url}): ${s.publisher}, cited ${s.checked}${s.note ? `. ${s.note}` : ""}`).join("\n")}

## Optional

- [Full text of the pages](${siteUrl}/llms-full.txt)
- [${JOBSHOP.name}](${JOBSHOP.url}): sibling product for the same shops. ${JOBSHOP.pitch}
`;
}

/** Minimal HTML -> Markdown for llms-full.txt (headings, list items, links, paragraphs). */
export function htmlToText(html, siteUrl, base) {
  const abs = (href) =>
    href.startsWith("/") ? `${siteUrl}${href.slice(base.length) || "/"}` : href;
  const md = html
    .replace(
      /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
      (_, h, t) => `[${stripTags(t)}](${abs(h)})`,
    )
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, "\n### $1\n")
    .replace(/<summary>([\s\S]*?)<\/summary>/g, "\n### $1\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<tr[^>]*>/g, "\n| ")
    .replace(/<\/t[dh]>/g, " |")
    .replace(/<\/(p|ul|table|section|aside|div|form)>/g, "\n");
  // Tags go until none are left, then &amp;/&quot; decode in one pass (&lt;/&gt; stay encoded).
  return decodeEntities(removeTags(md, "", /<(?!\/?h\d)[^>]+>/g), /&(?:amp|quot);/g)
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function build({
  siteUrl = DEFAULT_SITE_URL,
  basePath = DEFAULT_BASE_PATH,
  outDir = join(APP, "dist"),
} = {}) {
  const site = normalizeSiteUrl(siteUrl);
  const base = normalizeBasePath(basePath);
  rmSync(outDir, { recursive: true, force: true });
  /** @type {Record<string, string>} */
  const files = {};
  const full = [`# ${SITE_NAME}: full text`, ""];
  for (const page of PAGES) {
    const html = renderPage(page, { siteUrl: site, base });
    files[fileFor(page.path)] = html;
    if (page.indexable !== false) {
      const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
      full.push(`---\nSource: ${pageUrl(site, page.path)}\n`, htmlToText(main, site, base), "");
    }
  }
  files["404.html"] = renderPage(
    {
      path: "/404",
      indexable: false,
      title: `Page not found · ${SITE_NAME}`,
      description: "That page does not exist.",
      body: `<h1>Page not found</h1><p>Try the <a href="/">home page</a>.</p>${statusBox()}`,
    },
    { siteUrl: site, base },
  );
  files["sitemap.xml"] = renderSitemap(site);
  files["robots.txt"] = renderRobots(site, base);
  files["llms.txt"] = renderLlmsTxt(site);
  files["llms-full.txt"] = `${full.join("\n").trim()}\n`;
  files["styles.css"] = readFileSync(join(HERE, "styles.css"), "utf8");
  for (const [name, content] of Object.entries(files)) {
    const target = join(outDir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = build({
    siteUrl: process.env.SITE_URL || DEFAULT_SITE_URL,
    basePath: process.env.BASE_PATH ?? DEFAULT_BASE_PATH,
  });
  console.log(`[cmmc-site] wrote ${Object.keys(files).length} files to dist/`);
}
