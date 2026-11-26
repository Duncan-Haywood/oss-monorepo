#!/usr/bin/env node
// Checks the prerendered public pages written by scripts/prerender.mjs (listed in
// dist/prerender-manifest.json). Exit 1 on any failure.
//
//   node scripts/check-seo.mjs     # from apps/grants, after `pnpm build`
//
// Per page: exactly one non-empty <title>, unique across pages; a meta description; one canonical
// URL equal to SITE_URL + path (and og:url equal to it); a non-empty <h1> in #root; at least one
// JSON-LD block, every block JSON.parse-able, with the types the route asks for (Organization +
// WebSite on /, FAQPage on /faq, Product with offers on /pricing). No page, nor the SPA shell, may
// contain "localhost" or a placeholder "example" domain/email (example.com/.org/.net, *.example,
// @example). Plain prose like "for example" is allowed: the legal pages use it. Also checks that
// sitemap.xml lists exactly the prerendered pages and robots.txt points at it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = join(APP, "dist/client");
const MANIFEST = join(APP, "dist/prerender-manifest.json");

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

if (!existsSync(MANIFEST)) {
  console.error("check-seo: dist/prerender-manifest.json missing. Run `pnpm build` first.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const siteUrl = manifest.siteUrl;
if (process.env.SITE_URL && process.env.SITE_URL.replace(/\/+$/, "") !== siteUrl) {
  fail("manifest", `built for ${siteUrl}, but SITE_URL is ${process.env.SITE_URL}`);
}
if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) fail("manifest", "no pages");

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const text = (html) =>
  decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : null;
};
const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

const PLACEHOLDER = /localhost|[a-z0-9-]+\.example\b|\bexample\.(?:com|org|net)\b|@example\b/i;

function checkPlaceholders(where, html) {
  const m = PLACEHOLDER.exec(html);
  if (m) {
    const at = Math.max(0, m.index - 40);
    fail(
      where,
      `contains "${m[0]}" (…${html.slice(at, m.index + m[0].length + 40).replace(/\s+/g, " ")}…)`,
    );
  }
}

function typesIn(node, out = []) {
  if (Array.isArray(node)) for (const n of node) typesIn(n, out);
  else if (node && typeof node === "object") {
    const t = node["@type"];
    if (t) out.push(...(Array.isArray(t) ? t : [t]));
    for (const v of Object.values(node)) typesIn(v, out);
  }
  return out;
}
const nodesOfType = (blocks, type) => {
  const found = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n["@type"] === type) found.push(n);
      Object.values(n).forEach(walk);
    }
  };
  walk(blocks);
  return found;
};

const titles = new Map();
for (const page of manifest.pages ?? []) {
  const where = page.path;
  const file = join(CLIENT, page.file);
  if (!existsSync(file)) {
    fail(where, `missing ${page.file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const rootStart = html.indexOf('<div id="root">');
  const root = rootStart >= 0 ? html.slice(rootStart, html.lastIndexOf("</body>")) : "";

  // <title>
  const titleTags = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)];
  if (titleTags.length !== 1) fail(where, `expected 1 <title>, found ${titleTags.length}`);
  const title = titleTags[0] ? text(titleTags[0][1]) : "";
  if (!title) fail(where, "empty <title>");
  else if (titles.has(title)) fail(where, `duplicate title "${title}" (also ${titles.get(title)})`);
  else titles.set(title, where);

  // meta description
  const descs = tags(head, /<meta\s+name="description"[^>]*>/g);
  if (descs.length !== 1) fail(where, `expected 1 meta description, found ${descs.length}`);
  else if (!attr(descs[0], "content")?.trim()) fail(where, "empty meta description");

  // canonical + og:url
  const expected = `${siteUrl}${page.path}`;
  const canon = tags(head, /<link\s+rel="canonical"[^>]*>/g);
  if (canon.length !== 1) fail(where, `expected 1 canonical link, found ${canon.length}`);
  else if (attr(canon[0], "href") !== expected) {
    fail(where, `canonical is ${attr(canon[0], "href")}, expected ${expected}`);
  }
  const ogUrl = tags(head, /<meta\s+property="og:url"[^>]*>/g)[0];
  if (!ogUrl || attr(ogUrl, "content") !== expected)
    fail(where, "og:url missing or not the canonical URL");
  for (const prop of ["og:title", "og:description", "og:image"]) {
    if (!new RegExp(`property="${prop}" content="[^"]+"`).test(head))
      fail(where, `missing ${prop}`);
  }
  if (!/name="twitter:card" content="[^"]+"/.test(head)) fail(where, "missing twitter:card");

  // h1
  if (!root || text(root).length === 0) fail(where, "#root is empty");
  const h1s = [...root.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => text(m[1]));
  if (h1s.length === 0 || !h1s.some(Boolean)) fail(where, "no non-empty <h1>");

  // JSON-LD
  const blocks = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch (err) {
      fail(where, `invalid JSON-LD: ${err.message}`);
    }
  }
  if (blocks.length === 0) fail(where, "no JSON-LD");
  for (const b of blocks) {
    if (!String(b["@context"] ?? "").includes("schema.org"))
      fail(where, "JSON-LD without schema.org @context");
  }
  const types = new Set(typesIn(blocks));
  const want = page.structuredData ?? [];
  if (want.includes("organization") && !types.has("Organization"))
    fail(where, "missing Organization JSON-LD");
  if (want.includes("website") && !types.has("WebSite")) fail(where, "missing WebSite JSON-LD");
  if (want.includes("faq")) {
    const qs = nodesOfType(blocks, "Question");
    if (!types.has("FAQPage") || qs.length === 0)
      fail(where, "missing FAQPage JSON-LD with questions");
    for (const q of qs)
      if (!q.name || !q.acceptedAnswer?.text) fail(where, "FAQ question without name/answer");
  }
  if (want.includes("product")) {
    const offers = nodesOfType(blocks, "Offer");
    if (!types.has("Product") || offers.length === 0)
      fail(where, "missing Product JSON-LD with offers");
    for (const o of offers) {
      if (!(Number(o.price) >= 0) || !o.priceCurrency)
        fail(where, `offer "${o.name}" lacks price/currency`);
    }
  }

  if (want.includes("software")) {
    const app = nodesOfType(blocks, "SoftwareApplication")[0];
    if (!app?.name || !app.applicationCategory) fail(where, "missing SoftwareApplication JSON-LD");
  }
  if (want.includes("article")) {
    const art = nodesOfType(blocks, "Article")[0];
    if (!art?.headline || !art.dateModified || !art.publisher?.name)
      fail(where, "missing Article JSON-LD with headline, dateModified and publisher");
    if (
      !new RegExp(`<link rel="alternate" type="text/markdown" href="${expected}\\.md"`).test(head)
    )
      fail(where, "no text/markdown alternate link");
    if (!existsSync(join(CLIENT, `${page.path.slice(1)}.md`)))
      fail(where, `missing ${page.path}.md`);
  }
  if (want.includes("glossary")) {
    const terms = nodesOfType(blocks, "DefinedTerm");
    if (!types.has("DefinedTermSet") || terms.length === 0)
      fail(where, "missing DefinedTermSet JSON-LD with terms");
    for (const t of terms)
      if (!t.name || !t.description) fail(where, "DefinedTerm without name/description");
  }
  if (page.path !== "/") {
    const items = nodesOfType(blocks, "ListItem");
    if (!types.has("BreadcrumbList") || items.at(-1)?.item !== expected)
      fail(where, "missing BreadcrumbList ending at this page");
  }

  checkPlaceholders(where, html);
}

// SPA shell (served at every non-prerendered path)
const shell = join(CLIENT, "index.html");
if (existsSync(shell)) checkPlaceholders("index.html (SPA shell)", readFileSync(shell, "utf8"));

// sitemap.xml + robots.txt
const sitemapFile = join(CLIENT, "sitemap.xml");
if (!existsSync(sitemapFile)) fail("sitemap.xml", "missing");
else {
  const xml = readFileSync(sitemapFile, "utf8");
  checkPlaceholders("sitemap.xml", xml);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  const expected = new Set((manifest.pages ?? []).map((p) => `${siteUrl}${p.path}`));
  for (const loc of locs)
    if (!expected.has(loc)) fail("sitemap.xml", `lists ${loc}, which was not prerendered`);
  for (const loc of expected) if (!locs.includes(loc)) fail("sitemap.xml", `missing ${loc}`);
}
const robotsFile = join(CLIENT, "robots.txt");
if (!existsSync(robotsFile)) fail("robots.txt", "missing");
else {
  const robots = readFileSync(robotsFile, "utf8");
  checkPlaceholders("robots.txt", robots);
  if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`))
    fail("robots.txt", "no Sitemap line for SITE_URL");
}
// Answer-engine files: llms.txt links every prerendered page; llms-full.txt, the feed and robots.txt's
// AI crawler groups exist.
const llmsFile = join(CLIENT, "llms.txt");
if (!existsSync(llmsFile)) fail("llms.txt", "missing");
else {
  const llms = readFileSync(llmsFile, "utf8");
  checkPlaceholders("llms.txt", llms);
  if (!/^# .+\n\n> .+/.test(llms)) fail("llms.txt", "must start with an H1 and a > summary");
  for (const p of manifest.pages ?? [])
    if (!llms.includes(`](${siteUrl}${p.path})`)) fail("llms.txt", `no link to ${p.path}`);
}
for (const f of ["llms-full.txt", "resources/feed.xml"]) {
  const file = join(CLIENT, f);
  if (!existsSync(file)) fail(f, "missing");
  else checkPlaceholders(f, readFileSync(file, "utf8"));
}
if (existsSync(robotsFile)) {
  const robots = readFileSync(robotsFile, "utf8");
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"])
    if (!robots.includes(`User-agent: ${bot}`)) fail("robots.txt", `no group for ${bot}`);
}
if ((manifest.pages ?? []).some((p) => p.path === "/")) {
  const redirects = existsSync(join(CLIENT, "_redirects"))
    ? readFileSync(join(CLIENT, "_redirects"), "utf8")
    : "";
  // Rules match the public path, so a base path (BASE_PATH at build time) is on both sides.
  const base = manifest.basePath ?? "";
  const rule = `${base}/ ${base}/landing 200`;
  if (!redirects.split("\n").some((line) => line.trim() === rule))
    fail("_redirects", `missing "${rule}" (landing page not served at ${base}/)`);
}

if (failures.length > 0) {
  console.error(
    `check-seo: ${failures.length} problem(s)\n${failures.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `check-seo: ${manifest.pages.length} pages OK (${manifest.pages.map((p) => p.path).join(", ")})`,
);
