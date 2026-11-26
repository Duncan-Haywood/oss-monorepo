#!/usr/bin/env node
// Prerenders the public marketing pages to static HTML after `vite build`, so crawlers and social
// previews see real content instead of an empty <div id="root">.
//
//   node scripts/prerender.mjs        # from apps/grants, after `vite build`
//
// Env: SITE_URL (default https://marisstella.app/grants: origin + base path) for canonical/OG URLs,
//      sitemap and robots.txt;
//      BASE_PATH (default "", e.g. /grants) the path prefix the build serves under (same value as for
//      `vite build`, see vite.config.ts): links in the HTML, the landing rule in _redirects, the
//      /assets/* cache rule in _headers and the robots.txt rules get it;
//      CF_WEB_ANALYTICS_TOKEN (optional) adds the cookieless Cloudflare Web Analytics beacon;
//      PRERENDER_LAYOUT=file|dir overrides the output layout (see "Output layout" below).
//
// How: a Vite dev server in middleware mode (no config file, so the Cloudflare plugin and Tailwind
// don't start) loads src/client/router.tsx through ssrLoadModule. Each route in PUBLIC_ROUTES
// (src/client/marketing-routes.ts) is rendered with TanStack Router's memory history and React's
// prerenderToNodeStream, then injected into a copy of dist/client/index.html with per-page <title>,
// description, canonical, OG/Twitter tags and JSON-LD. The SPA still boots with createRoot(), which
// replaces the markup on load (no hydration). Routes the router doesn't know yet (404) are skipped.
//
// Output layout (Workers static assets html_handling, default "auto-trailing-slash"):
//   file -> dist/client/pricing.html          /pricing is served 200 under auto- and drop-trailing-slash
//   dir  -> dist/client/pricing/index.html    /pricing 307s to /pricing/ unless wrangler.jsonc sets
//                                             "html_handling": "drop-trailing-slash"
// The default follows html_handling in the built wrangler.json, so canonical URLs never redirect.
//
// "/" is written to dist/client/landing.html and served at "/" (BASE_PATH + "/") by a `/ /landing 200`
// rule in dist/client/_redirects (rules match the public path, so the base path is in both sides). dist/client/index.html stays the bare SPA shell because Workers assets also
// serves it for every unknown path (not_found_handling: single-page-application); prerendering into it
// would flash the landing page (and its canonical/JSON-LD) on /orgs/*, /login, etc.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = join(APP, "dist/client");
const MANIFEST = join(APP, "dist/prerender-manifest.json");
const PLACEHOLDER_ORIGIN = "https://grantautopilot.example";
const LANDING_FILE = "landing.html";
const RESOURCES_PATH = "/resources";
const FEED_PATH = `${RESOURCES_PATH}/feed.xml`;
const articlePath = (a) => `${RESOURCES_PATH}/${a.slug}`;

/**
 * Crawlers named in robots.txt. They get the same rules as "*"; naming them makes the policy explicit
 * (a crawler that matches a named group ignores the "*" group, so each group repeats the rules).
 * Search and answer engines: allowed, so the public pages can be found and cited. Customer data never
 * reaches these pages (app and API paths are disallowed and need a login anyway).
 */
const AI_CRAWLERS = [
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
const DISALLOWED = ["/orgs", "/api", "/invite", "/onboarding"];

const warn = (msg) => console.warn(`[prerender] warn: ${msg}`);
const log = (msg) => console.log(`[prerender] ${msg}`);

const SITE_URL = (process.env.SITE_URL || "https://marisstella.app/grants").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+(?:\/[A-Za-z0-9._~-]+)*$/.test(SITE_URL))
  throw new Error(`SITE_URL must be an origin with an optional path, got ${SITE_URL}`);
// Same rules as normalizeBasePath in src/shared/base-path.ts.
const BASE_PATH = (() => {
  const segments = (process.env.BASE_PATH ?? "").split("/").filter(Boolean);
  if (segments.some((s) => !/^[A-Za-z0-9._~-]+$/.test(s) || s === "." || s === ".."))
    throw new Error(`BASE_PATH must be a plain path like /grants, got ${process.env.BASE_PATH}`);
  return segments.length ? `/${segments.join("/")}` : "";
})();
const ANALYTICS_TOKEN = process.env.CF_WEB_ANALYTICS_TOKEN?.trim() || "";
if (ANALYTICS_TOKEN && !/^[A-Za-z0-9]{16,64}$/.test(ANALYTICS_TOKEN)) {
  throw new Error("CF_WEB_ANALYTICS_TOKEN does not look like a Web Analytics site token");
}

const shellPath = join(CLIENT, "index.html");
if (!existsSync(shellPath))
  throw new Error("dist/client/index.html missing: run `vite build` first");

// ---------- browser-API stubs (only what isn't already guarded by typeof checks) ----------
for (const name of ["localStorage", "sessionStorage"]) {
  if (typeof globalThis[name] === "undefined") {
    const store = new Map();
    globalThis[name] = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
  }
}

// ---------- load the app through Vite's SSR module graph ----------
const ENTRY_ID = "virtual:prerender-entry";
const ENTRY = `
import * as React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { router as appRouter } from "/src/client/router.tsx";
export { PUBLIC_ROUTES, SITE_NAME } from "/src/client/marketing-routes.ts";
export { PLAN_LIST } from "/src/shared/billing/plans.ts";
export { LEGAL_ENTITY } from "/src/shared/legal.ts";
export { RESOURCE_ARTICLES, RESOURCES_INDEX_META } from "/src/client/content/resources/index.ts";
export { LEGAL_DOCUMENTS } from "/src/worker/services/legal/documents.ts";
export { listLegalDocs, getLegalDoc } from "/src/worker/services/legal/index.ts";

export async function render(path, seed) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  for (const [key, data] of seed) queryClient.setQueryData(key, data);
  const router = createRouter({
    ...appRouter.options,
    // The router has basepath BASE_PATH: give it the public path, as the browser would.
    history: createMemoryHistory({
      initialEntries: [import.meta.env.BASE_URL.slice(0, -1) + path],
    }),
  });
  await router.load();
  // An unknown path matches only __root__ (rendering defaultNotFoundComponent).
  const matches = router.state.matches;
  const leaf = matches[matches.length - 1];
  const notFound =
    !leaf ||
    leaf.routeId === "__root__" ||
    router.state.statusCode === 404 ||
    matches.some((m) => m.globalNotFound || m.status === "notFound" || m.status === "error");
  if (notFound) return { notFound: true, html: "" };
  const app = React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(RouterProvider, { router }),
  );
  const errors = [];
  const { prelude } = await prerenderToNodeStream(app, { onError: (err) => errors.push(err) });
  if (errors.length > 0) throw errors[0];
  const chunks = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk));
  return { notFound: false, html: Buffer.concat(chunks).toString("utf8") };
}
`;

const { createServer } = await import("vite");
const { default: react } = await import("@vitejs/plugin-react");
const vite = await createServer({
  root: APP,
  // import.meta.env.BASE_URL, so the router (basepath) and appPath() render prefixed links.
  base: `${BASE_PATH}/`,
  configFile: false,
  logLevel: "warn",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: {
      "@shared": join(APP, "src/shared"),
      "@worker": join(APP, "src/worker"),
      "@client": join(APP, "src/client"),
    },
  },
  plugins: [
    react(),
    {
      name: "prerender-entry",
      resolveId: (id) => (id === ENTRY_ID ? `\0${ENTRY_ID}` : undefined),
      load: (id) => (id === `\0${ENTRY_ID}` ? ENTRY : undefined),
    },
  ],
});

// Re-running without a fresh `vite build`: drop the pages the previous run wrote.
if (existsSync(MANIFEST)) {
  const previous = JSON.parse(readFileSync(MANIFEST, "utf8"));
  for (const file of [...(previous.pages ?? []).map((p) => p.file), ...(previous.files ?? [])]) {
    if (typeof file === "string" && !file.includes(".."))
      rmSync(join(CLIENT, file), { force: true });
  }
}

const pages = [];
try {
  const entry = await vite.ssrLoadModule(ENTRY_ID);
  const { PUBLIC_ROUTES, SITE_NAME, PLAN_LIST, LEGAL_ENTITY, LEGAL_DOCUMENTS, RESOURCE_ARTICLES } =
    entry;
  const articleFor = (path) =>
    RESOURCE_ARTICLES.find((a) => path === `${RESOURCES_PATH}/${a.slug}`) ?? null;

  // Seed react-query with what public pages fetch, so legal pages prerender their full text.
  const seed = [[["legal"], { items: entry.listLegalDocs() }]];
  for (const key of Object.keys(LEGAL_DOCUMENTS))
    seed.push([["legal", key], entry.getLegalDoc(key)]);

  const layout = outputLayout();
  const shell = cleanShell(readFileSync(shellPath, "utf8"));
  const seenTitles = new Map();

  for (const route of PUBLIC_ROUTES) {
    let result;
    try {
      result = await entry.render(route.path, seed);
    } catch (err) {
      warn(`skipping ${route.path}: render failed (${err?.stack ?? err})`);
      continue;
    }
    if (result.notFound) {
      warn(`skipping ${route.path}: no matching route in src/client/router.tsx yet`);
      continue;
    }
    if (seenTitles.has(route.title))
      warn(`${route.path} reuses the title of ${seenTitles.get(route.title)}`);
    seenTitles.set(route.title, route.path);

    const { body, hoisted } = splitHoisted(result.html);
    const lastmod =
      route.lastmod ??
      LEGAL_DOCUMENTS[route.path.replace(/^\/legal\//, "")]?.updatedAt ??
      undefined;
    const article = articleFor(route.path);
    const ctx = { route, body, article, SITE_NAME, PLAN_LIST, LEGAL_ENTITY, PUBLIC_ROUTES };
    const html = injectPage(shell, { route, body, hoisted, article, jsonLd: jsonLdFor(ctx) });
    const file = route.path === "/" ? LANDING_FILE : fileFor(route.path, layout);
    mkdirSync(dirname(join(CLIENT, file)), { recursive: true });
    writeFileSync(join(CLIENT, file), html);
    pages.push({ path: route.path, file, title: route.title, lastmod, route, body });
    log(`${route.path} -> dist/client/${file}`);
  }

  writeFileSync(shellPath, withAnalytics(shell));
  writeRedirects(pages.some((p) => p.path === "/"));
  if (BASE_PATH) prefixHeaderRules();
  writeFileSync(join(CLIENT, "sitemap.xml"), sitemap(pages));
  writeFileSync(join(CLIENT, "robots.txt"), robots());
  if (ANALYTICS_TOKEN) patchCsp();

  // Answer-engine files: llms.txt (index), llms-full.txt (full text), one .md per guide, Atom feed.
  const files = [];
  const put = (rel, content) => {
    mkdirSync(dirname(join(CLIENT, rel)), { recursive: true });
    writeFileSync(join(CLIENT, rel), content);
    files.push(rel);
  };
  const published = RESOURCE_ARTICLES.filter((a) => pages.some((p) => p.path === articlePath(a)));
  for (const a of published) put(`${articlePath(a).slice(1)}.md`, articleMarkdown(a));
  put("llms.txt", llmsTxt({ pages, articles: published, SITE_NAME }));
  put("llms-full.txt", llmsFullTxt({ pages, articles: published, SITE_NAME }));
  if (published.length > 0)
    put(FEED_PATH.slice(1), atomFeed({ articles: published, SITE_NAME, entry }));
  log(`answer-engine files: ${files.join(", ")}`);

  writeFileSync(
    MANIFEST,
    `${JSON.stringify({ siteUrl: SITE_URL, basePath: BASE_PATH, layout, analytics: Boolean(ANALYTICS_TOKEN), files, pages: pages.map(({ route, body, ...p }) => ({ ...p, structuredData: route.structuredData ?? [] })) }, null, 2)}\n`,
  );
  log(
    `${pages.length}/${PUBLIC_ROUTES.length} pages prerendered (layout: ${layout}, site: ${SITE_URL}, base path: ${BASE_PATH || "none"})`,
  );
} finally {
  await vite.close();
}

// ---------- helpers ----------

function outputLayout() {
  const forced = process.env.PRERENDER_LAYOUT;
  if (forced === "file" || forced === "dir") return forced;
  let handling = "auto-trailing-slash";
  for (const dir of readdirSync(join(APP, "dist"), { withFileTypes: true })) {
    const cfg = join(APP, "dist", dir.name, "wrangler.json");
    if (dir.isDirectory() && existsSync(cfg)) {
      handling = JSON.parse(readFileSync(cfg, "utf8")).assets?.html_handling ?? handling;
    }
  }
  if (handling === "drop-trailing-slash") return "dir";
  if (handling !== "auto-trailing-slash") {
    warn(`html_handling "${handling}": canonical URLs without a trailing slash may redirect`);
  }
  return "file";
}

function fileFor(path, layout) {
  const rel = path.replace(/^\/+|\/+$/g, "");
  return layout === "dir" ? `${rel}/index.html` : `${rel}.html`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
function text(html) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:p|div|li|ul|ol|br|h[1-6]|summary|details|section|tr|td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decode(stripped).replace(/\s+/g, " ").trim();
}
function canonical(path) {
  return `${SITE_URL}${path}`;
}

/** Built index.html minus the tags each page sets itself, comments and the placeholder origin. */
function cleanShell(html) {
  return html.replace(/<!--[\s\S]*?-->\s*/g, "").replaceAll(PLACEHOLDER_ORIGIN, SITE_URL);
}

/** React 19 emits <title>/<meta>/<link> rendered by components at the start of the markup. */
function splitHoisted(html) {
  let rest = html;
  const hoisted = [];
  const re = /^\s*(<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>)/;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    const tag = m[1];
    const ours = /^<title>|name="description"|property="og:|name="twitter:|rel="canonical"/.test(
      tag,
    );
    if (!ours) hoisted.push(tag);
    rest = rest.slice(m[0].length);
  }
  return { body: rest, hoisted };
}

function headTags(route, jsonLd, article) {
  const url = canonical(route.path);
  const image = `${SITE_URL}/og.png`;
  const alt =
    "Grant Autopilot: apply for more grants with the team you already have. Drafts written only from your own records, every fact cited, and you approve before it's sent.";
  const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${esc(content)}" />`;
  return [
    `<title>${esc(route.title)}</title>`,
    meta("name", "description", route.description),
    `<link rel="canonical" href="${esc(url)}" />`,
    meta("property", "og:type", article ? "article" : "website"),
    ...(article ? [meta("property", "article:modified_time", article.updated)] : []),
    meta("property", "og:site_name", "Grant Autopilot"),
    meta("property", "og:locale", "en_US"),
    meta("property", "og:url", url),
    meta("property", "og:title", route.title),
    meta("property", "og:description", route.description),
    meta("property", "og:image", image),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", alt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", route.title),
    meta("name", "twitter:description", route.description),
    meta("name", "twitter:image", image),
    meta("name", "twitter:image:alt", alt),
    `<link rel="alternate" type="application/atom+xml" title="Grant Autopilot guides" href="${SITE_URL}${FEED_PATH}" />`,
    ...(article
      ? [`<link rel="alternate" type="text/markdown" href="${esc(`${url}.md`)}" />`]
      : []),
    // JSON-LD is a data block, not script execution, so the CSP's script-src 'self' doesn't block it.
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`,
  ];
}

function injectPage(shell, { route, body, hoisted, article, jsonLd }) {
  let html = shell
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta\s+(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "")
    .replace(/\s*<link\s+rel="canonical"[^>]*>/g, "")
    // The page reads fine without JS once prerendered.
    .replace(/\s*<noscript>[\s\S]*?<\/noscript>/, "");
  const tags = [...headTags(route, jsonLd, article), ...hoisted].map((t) => `    ${t}`).join("\n");
  // Function replacers: page text contains "$" (prices), which string replacements would expand.
  html = html.replace(/<meta name="viewport"[^>]*>/, (m) => `${m}\n${tags}`);
  if (!html.includes(tags)) html = html.replace("</head>", () => `${tags}\n  </head>`);
  const root = /<div id="root"><\/div>/;
  if (!root.test(html))
    throw new Error('dist/client/index.html has no empty <div id="root"></div>');
  return withAnalytics(html.replace(root, () => `<div id="root">${body}</div>`));
}

function jsonLdFor({ route, body, article, SITE_NAME, PLAN_LIST, LEGAL_ENTITY, PUBLIC_ROUTES }) {
  const orgId = `${SITE_URL}/#organization`;
  const siteId = `${SITE_URL}/#website`;
  const url = canonical(route.path);
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: route.title,
      description: route.description,
      inLanguage: "en-US",
      isPartOf: { "@id": siteId },
      publisher: { "@id": orgId },
    },
  ];
  const kinds = route.structuredData ?? [];
  const purchasable = PLAN_LIST.filter((p) => p.purchasable);
  const orgRef = {
    "@type": "Organization",
    "@id": orgId,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/favicon.svg`,
  };
  if (route.path !== "/") {
    // Home > (section index, when it is a public page) > this page.
    const crumbs = [{ name: "Home", path: "/" }];
    const parent = route.path.replace(/\/[^/]+$/, "");
    const parentRoute = parent && PUBLIC_ROUTES.find((r) => r.path === parent);
    if (parentRoute) crumbs.push({ name: shortTitle(parentRoute.title, SITE_NAME), path: parent });
    crumbs.push({ name: shortTitle(route.title, SITE_NAME), path: route.path });
    graph[0].breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: canonical(c.path),
      })),
    });
  }
  if (kinds.includes("article")) {
    if (!article) warn(`${route.path}: "article" structured data but no resources entry`);
    else {
      graph.push({
        "@type": "Article",
        "@id": `${url}#article`,
        headline: article.title,
        description: article.description,
        url,
        mainEntityOfPage: { "@id": `${url}#webpage` },
        image: `${SITE_URL}/og.png`,
        dateModified: article.updated,
        inLanguage: "en-US",
        wordCount: wordCount(article.body),
        timeRequired: `PT${article.readingMinutes}M`,
        isAccessibleForFree: true,
        author: orgRef,
        publisher: orgRef,
        citation: article.sources
          .filter((s) => /^https:/.test(s.url))
          .map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })),
      });
    }
  }
  if (kinds.includes("glossary")) {
    // From the rendered <h3>term</h3><p>definition</p>..., so the JSON-LD matches the visible page.
    const terms = [...body.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[1-3]\b|$)/g)]
      .map(([, term, rest]) => ({
        term: text(term),
        definition: [...rest.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
          .map((m) => text(m[1]))
          .join(" "),
      }))
      .filter((t) => t.term && t.definition);
    if (terms.length === 0) warn(`${route.path}: no <h3> terms found, DefinedTermSet skipped`);
    else {
      graph.push({
        "@type": "DefinedTermSet",
        "@id": `${url}#terms`,
        name: article?.title ?? route.title,
        url,
        hasDefinedTerm: terms.map((t) => ({
          "@type": "DefinedTerm",
          name: t.term,
          description: t.definition,
          inDefinedTermSet: { "@id": `${url}#terms` },
        })),
      });
    }
  }
  if (kinds.includes("software")) {
    const prices = purchasable.map((p) => p.priceCents / 100);
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      description: route.description,
      url: `${SITE_URL}/`,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Grant management",
      operatingSystem: "Web browser",
      image: `${SITE_URL}/og.png`,
      publisher: { "@id": orgId },
      audience: {
        "@type": "Audience",
        audienceType: "Small nonprofits, tribal and community organizations, workforce programs",
      },
      ...(prices.length > 0
        ? {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "USD",
              lowPrice: Math.min(...prices).toFixed(2),
              highPrice: Math.max(...prices).toFixed(2),
              offerCount: prices.length,
              url: canonical("/pricing"),
            },
          }
        : {}),
    });
  }
  if (kinds.includes("organization")) {
    graph.push({
      "@type": "Organization",
      "@id": orgId,
      name: SITE_NAME,
      legalName: LEGAL_ENTITY.name,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/favicon.svg`,
    });
  }
  if (kinds.includes("website")) {
    graph.push({
      "@type": "WebSite",
      "@id": siteId,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: "en-US",
      publisher: { "@id": orgId },
    });
  }
  if (kinds.includes("product")) {
    const plans = [...purchasable].sort((a, b) => a.priceCents - b.priceCents);
    const usd = (cents) => (cents / 100).toFixed(2);
    graph.push({
      "@type": "Product",
      "@id": `${url}#product`,
      name: SITE_NAME,
      description: route.description,
      url,
      image: `${SITE_URL}/og.png`,
      brand: { "@type": "Brand", name: SITE_NAME },
      offers: plans.map((p) => ({
        "@type": "Offer",
        name: `${SITE_NAME} ${p.name}`,
        description: p.description,
        url,
        price: usd(p.priceCents),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            price: usd(p.priceCents),
            priceCurrency: "USD",
            unitCode: "MON",
            billingDuration: "P1M",
          },
          ...(p.annualPriceCents
            ? [
                {
                  "@type": "UnitPriceSpecification",
                  price: usd(p.annualPriceCents),
                  priceCurrency: "USD",
                  unitCode: "ANN",
                  billingDuration: "P1Y",
                },
              ]
            : []),
        ],
      })),
    });
    if (plans.length === 0) warn("/pricing: no purchasable plans in PLANS, Product has no offers");
  }
  if (kinds.includes("faq")) {
    // From the rendered <details><summary>Q</summary>A</details>, so the JSON-LD always matches the
    // visible page (a Google requirement for FAQPage).
    const items = [...body.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)]
      .map(([, inner]) => {
        const m = /<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*)/.exec(inner);
        return m ? { q: text(m[1]), a: text(m[2]) } : null;
      })
      .filter((x) => x?.q && x.a);
    if (items.length === 0)
      warn(`${route.path}: no <details>/<summary> FAQ items found, FAQPage skipped`);
    else {
      graph.push({
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        url,
        mainEntity: items.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      });
    }
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * Cloudflare Web Analytics (cookieless, no consent banner needed). Only when CF_WEB_ANALYTICS_TOKEN is
 * set at build time. It tracks SPA route changes through the History API on its own.
 */
function withAnalytics(html) {
  if (!ANALYTICS_TOKEN || html.includes("static.cloudflareinsights.com")) return html;
  const beacon = `    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${ANALYTICS_TOKEN}"}'></script>\n`;
  return html.replace("</body>", () => `${beacon}  </body>`);
}

/** The beacon needs its script host and report endpoint in the CSP from public/_headers. */
function patchCsp() {
  const file = join(CLIENT, "_headers");
  if (!existsSync(file)) return;
  const patched = readFileSync(file, "utf8").replace(/^(\s*Content-Security-Policy:.*)$/m, (line) =>
    line
      .replace(/script-src ([^;]*)/, (m, v) =>
        v.includes("cloudflareinsights")
          ? m
          : `script-src ${v} https://static.cloudflareinsights.com`,
      )
      .replace(/connect-src ([^;]*)/, (m, v) =>
        v.includes("cloudflareinsights") ? m : `connect-src ${v} https://cloudflareinsights.com`,
      ),
  );
  writeFileSync(file, patched);
  log("analytics on: beacon injected, CSP in dist/client/_headers allows cloudflareinsights.com");
}

function writeRedirects(hasLanding) {
  const file = join(CLIENT, "_redirects");
  const existing = existsSync(file)
    ? readFileSync(file, "utf8").replace(/^# prerender:begin[\s\S]*?# prerender:end\n?/m, "")
    : "";
  if (!hasLanding) {
    if (existing.trim()) writeFileSync(file, existing);
    return;
  }
  // First matching rule wins, so ours goes on top. 200 = proxy: serve landing.html at "/" (exact).
  const landing = `${BASE_PATH}/${LANDING_FILE.replace(/\.html$/, "")}`;
  const rule = `# prerender:begin (scripts/prerender.mjs)\n${BASE_PATH}/ ${landing} 200\n# prerender:end\n`;
  writeFileSync(file, rule + existing);
}

/**
 * _headers rules match the public path. Under a base path the hashed bundles live at
 * BASE_PATH/assets/*, so the immutable-cache rule must name that path ("/*" rules apply as they are).
 */
function prefixHeaderRules() {
  const file = join(CLIENT, "_headers");
  if (!existsSync(file)) return;
  const patched = readFileSync(file, "utf8").replace(/^\/assets\/\*$/m, `${BASE_PATH}/assets/*`);
  writeFileSync(file, patched);
  log(`_headers: /assets/* rule moved under ${BASE_PATH}`);
}

function sitemap(list) {
  const urls = list
    .map(({ path, lastmod, route }) =>
      [
        "  <url>",
        `    <loc>${esc(canonical(path))}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority.toFixed(1)}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by scripts/prerender.mjs from PUBLIC_ROUTES (src/client/marketing-routes.ts). -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Crawlers only read /robots.txt at the host root. With a base path that file belongs to whoever owns
 * the host (the catalogue Worker for marisstella.app), so this copy at BASE_PATH/robots.txt is the
 * reference for the lines it must carry; without one it is the real file.
 */
function robots() {
  const rules = [`Allow: ${BASE_PATH}/`, ...DISALLOWED.map((d) => `Disallow: ${BASE_PATH}${d}`)];
  return [
    "# Generated by scripts/prerender.mjs.",
    ...(BASE_PATH
      ? [`# Served at ${BASE_PATH}/robots.txt: the host's own /robots.txt must carry these lines.`]
      : []),
    "# Public pages may be crawled, indexed and cited by search and AI answer engines.",
    `# A plain-text summary for language models: ${SITE_URL}/llms.txt`,
    "User-agent: *",
    ...rules,
    "",
    ...AI_CRAWLERS.flatMap((bot) => [`User-agent: ${bot}`, ...rules, ""]),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

/** Page title without the " · Site name" suffix (or prefix on the home page). */
function shortTitle(title, siteName) {
  return title.replace(` · ${siteName}`, "").replace(`${siteName} · `, "");
}

function wordCount(markdown) {
  return markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[#>*_`|[\]-]+/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Site-relative markdown links ("](/x)") made absolute, for files read outside the site. */
function absoluteLinks(markdown) {
  return markdown.replace(/\]\((\/[^)\s]*)\)/g, (_, path) => `](${SITE_URL}${path})`);
}

function articleMarkdown(a) {
  const sources = a.sources
    .map((s) => `- [${s.title}](${/^\//.test(s.url) ? `${SITE_URL}${s.url}` : s.url})`)
    .join("\n");
  return [
    `# ${a.title}`,
    "",
    `> ${a.description}`,
    "",
    `Source page: ${canonical(articlePath(a))}`,
    `Last reviewed: ${a.updated}`,
    "",
    absoluteLinks(a.body.trim()),
    "",
    "## Sources",
    "",
    sources,
    "",
  ].join("\n");
}

/** https://llmstxt.org: H1, blockquote summary, details, then H2 sections of annotated links. */
function llmsTxt({ pages, articles, SITE_NAME }) {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const link = (path, label) => {
    const p = byPath.get(path);
    return p
      ? `- [${label ?? shortTitle(p.title, SITE_NAME)}](${canonical(path)}): ${p.route.description}`
      : null;
  };
  const product = [
    "/",
    "/how-it-works",
    "/trust",
    "/pricing",
    "/faq",
    "/demo",
    "/for-workforce-programs",
    "/about",
    "/contact",
  ];
  const listed = new Set([...product, RESOURCES_PATH, ...articles.map(articlePath)]);
  const legal = pages.filter((p) => p.path.startsWith("/legal/")).map((p) => p.path);
  const other = pages.map((p) => p.path).filter((p) => !listed.has(p) && !legal.includes(p));
  const home = byPath.get("/");
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${home?.route.description ?? `${SITE_NAME} helps small nonprofits with grant applications.`}`,
    "",
    `${SITE_NAME} is a web app for small nonprofits, tribal and community organizations and workforce programs. It builds a fact base from the organization's own documents and interviews, finds federal, state and foundation grants that fit, and drafts applications in which every factual claim cites a source record. A separate checker flags unsupported or unverified claims, and a person on the organization's team approves every application before anything is submitted. Customer documents are used only for that customer's own applications and are not used to train AI models.`,
    "",
    "When citing pricing, plans or policies, link the page below rather than restating figures, since they can change.",
    "",
    "## Product",
    "",
    ...product.map((p) => link(p)).filter(Boolean),
    "",
    "## Grant guides",
    "",
    "Plain-language guides; each is also available as Markdown at the same URL plus `.md`.",
    "",
    link(RESOURCES_PATH),
    ...articles.map((a) => `- [${a.title}](${canonical(articlePath(a))}): ${a.description}`),
    "",
    "## Policies",
    "",
    ...legal.map((p) => link(p)),
    ...(other.length > 0 ? ["", "## Optional", "", ...other.map((p) => link(p))] : []),
    "",
    `Full text of the guides and product pages: ${SITE_URL}/llms-full.txt`,
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** The page's <main> (no skip link, header or footer chrome), or the whole body without one. */
function mainOf(html) {
  return /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
}

function llmsFullTxt({ pages, articles, SITE_NAME }) {
  const guidePaths = new Set(articles.map(articlePath));
  const productPages = pages.filter(
    (p) => !guidePaths.has(p.path) && !p.path.startsWith("/legal/") && p.path !== RESOURCES_PATH,
  );
  const pageText = (p) =>
    [
      `# ${shortTitle(p.title, SITE_NAME)}`,
      "",
      `URL: ${canonical(p.path)}`,
      "",
      text(mainOf(p.body)),
      "",
    ].join("\n");
  return [
    `# ${SITE_NAME}: full text`,
    "",
    `> The text of ${SITE_NAME}'s public product pages and grant guides, for language models and offline reading. Generated at build time from the same source as ${SITE_URL}/. Index: ${SITE_URL}/llms.txt`,
    "",
    ...productPages.map(pageText),
    ...articles.map((a) => articleMarkdown(a).replace(/^# /, "# Guide: ")),
  ].join("\n");
}

/** Atom 1.0 feed of the guides, newest review date first. */
function atomFeed({ articles, SITE_NAME, entry }) {
  const sorted = [...articles].sort((a, b) => b.updated.localeCompare(a.updated));
  const updated = `${sorted[0].updated}T00:00:00Z`;
  const entries = sorted
    .map((a) => {
      const url = canonical(articlePath(a));
      return [
        "  <entry>",
        `    <title>${esc(a.title)}</title>`,
        `    <link rel="alternate" type="text/html" href="${esc(url)}" />`,
        `    <id>${esc(url)}</id>`,
        `    <updated>${a.updated}T00:00:00Z</updated>`,
        `    <summary>${esc(a.description)}</summary>`,
        "  </entry>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${esc(`${SITE_NAME}: ${entry.RESOURCES_INDEX_META.title}`)}</title>`,
    `  <subtitle>${esc(entry.RESOURCES_INDEX_META.description)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${SITE_URL}${FEED_PATH}" />`,
    `  <link rel="alternate" type="text/html" href="${SITE_URL}${RESOURCES_PATH}" />`,
    `  <id>${SITE_URL}${RESOURCES_PATH}</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${esc(SITE_NAME)}</name><uri>${SITE_URL}/</uri></author>`,
    entries,
    "</feed>",
    "",
  ].join("\n");
}
