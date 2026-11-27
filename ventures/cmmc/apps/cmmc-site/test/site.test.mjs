// Build output checks (SEO/AEO) and the copy guard: no certification, endorsement, guaranteed-score
// or testimonial claims; the dated CMMC status on every page; every external number sourced.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, fileFor, htmlToText, normalizeBasePath, withBase } from "../src/build.mjs";
import { PAGES } from "../src/pages.mjs";
import { JOBSHOP, SOURCES, STATUS_CHECKED } from "../src/site.mjs";

const out = mkdtempSync(join(tmpdir(), "cmmc-site-"));
const files = build({ outDir: out });
const read = (f) => readFileSync(join(out, f), "utf8");
const indexable = PAGES.filter((p) => p.indexable !== false);
const SITE = "https://marisstella.app/cmmc";

test("required pages exist", () => {
  for (const path of [
    "/",
    "/cmmc-level-1-vs-level-2",
    "/what-it-does",
    "/security",
    "/pricing",
    "/early-access",
  ])
    assert.ok(
      PAGES.some((p) => p.path === path),
      path,
    );
  for (const f of [
    "sitemap.xml",
    "robots.txt",
    "llms.txt",
    "llms-full.txt",
    "404.html",
    "styles.css",
  ])
    assert.ok(files[f], f);
});

test("titles and descriptions are unique and sized; canonicals and JSON-LD on indexable pages", () => {
  const titles = new Set(PAGES.map((p) => p.title));
  assert.equal(titles.size, PAGES.length);
  for (const p of indexable) {
    assert.ok(
      p.description.length >= 70 && p.description.length <= 200,
      `${p.path} description length`,
    );
    const html = read(fileFor(p.path));
    const canonical = p.path === "/" ? `${SITE}/` : `${SITE}${p.path}`;
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${p.path} canonical`);
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
    assert.ok(ld, `${p.path} JSON-LD`);
    const data = JSON.parse(ld[1]);
    assert.ok(data["@graph"].some((n) => n["@type"] === "WebPage"));
    assert.ok(
      !/"(aggregateRating|review)"/i.test(ld[1]),
      "no ratings or reviews in structured data",
    );
  }
  const faq = read("cmmc-level-1-vs-level-2.html");
  assert.match(faq, /"@type":"FAQPage"/);
});

test("utility pages are noindex and absent from the sitemap", () => {
  const sitemap = read("sitemap.xml");
  for (const p of PAGES) {
    const loc = `<loc>${p.path === "/" ? `${SITE}/` : `${SITE}${p.path}`}</loc>`;
    if (p.indexable === false) {
      assert.match(read(fileFor(p.path)), /<meta name="robots" content="noindex">/);
      assert.ok(!sitemap.includes(loc), `${p.path} not in sitemap`);
    } else {
      assert.ok(sitemap.includes(loc), `${p.path} in sitemap`);
    }
  }
});

test("internal links carry the base path and point at real pages", () => {
  const known = new Set([
    ...PAGES.map((p) => p.path),
    "/styles.css",
    "/llms.txt",
    "/api/early-access",
  ]);
  for (const p of PAGES) {
    const html = read(fileFor(p.path));
    for (const [, attr, target] of html.matchAll(/\b(href|action)="(\/[^"]*)"/g)) {
      assert.ok(target.startsWith("/cmmc/"), `${p.path}: ${attr}=${target} lacks base path`);
      const local = target.slice("/cmmc".length).split(/[?#]/)[0];
      assert.ok(known.has(local), `${p.path}: broken link ${target}`);
    }
  }
  assert.equal(withBase('<a href="/x">', ""), '<a href="/x">');
  assert.equal(withBase('<a href="//cdn">', "/b"), '<a href="//cdn">');
  assert.throws(() => normalizeBasePath("/../x"));
});

test("robots.txt allows public pages, disallows the API, names AI crawlers and the sitemap", () => {
  const robots = read("robots.txt");
  assert.match(robots, /User-agent: \*\nAllow: \/cmmc\/\nDisallow: \/cmmc\/api\//);
  assert.match(robots, /User-agent: ClaudeBot/);
  assert.match(robots, /Sitemap: https:\/\/marisstella\.app\/cmmc\/sitemap\.xml/);
});

test("llms.txt follows llmstxt.org shape and carries the non-claims and the dated status", () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# .+\n\n> /);
  assert.match(llms, /Not a C3PAO/);
  assert.match(llms, /Phase 2 suspended on 13 Jul 2026/);
  for (const p of indexable)
    assert.ok(llms.includes(p.path === "/" ? `${SITE}/)` : `${SITE}${p.path})`), p.path);
  const full = read("llms-full.txt");
  assert.match(full, /# CMMC Level 1 vs Level 2/);
  assert.ok(!/<[a-z]+[ >]/.test(full.replace(/<\d/g, "")), "no HTML tags left in llms-full.txt");
  assert.equal(htmlToText('<a href="/cmmc/pricing">P</a>', SITE, "/cmmc"), `[P](${SITE}/pricing)`);
});

test("every page shows the dated CMMC phase status or links to it, and the non-claims footer", () => {
  for (const p of PAGES) {
    const html = read(fileFor(p.path));
    assert.match(html, /Not a C3PAO or assessor; not affiliated with or endorsed by the DoD/);
    assert.match(html, /does not certify your shop or guarantee any score/);
  }
  for (const path of ["/", "/cmmc-level-1-vs-level-2", "/what-it-does"]) {
    const html = read(fileFor(path));
    assert.match(html, /Phase 1 has been in effect since 10 Nov 2025/);
    assert.match(html, /suspended on 13 Jul 2026/);
    assert.ok(html.includes("checked 24 Nov 2026"), `${path} status is dated`);
  }
  assert.equal(STATUS_CHECKED, "2026-11-24");
});

// Phrases that would claim or imply certification, endorsement, guaranteed results or social proof.
const FORBIDDEN = [
  /\b(?:get|become|be|are|we're|we are) (?:cmmc[- ])?certified\b/i,
  /\bcmmc[- ]certified\b/i,
  /\bguaranteed (?:score|pass|compliance|certification)/i,
  /\b(?:we|it) guarantees?\b/i,
  /\bendorsed by\b(?! the DoD or the Cyber AB)/i,
  /\b(?:approved|authorized|accredited) (?:by|C3PAO)\b/i,
  /\bC3PAO (?:partner|approved)\b/i,
  /\bofficial (?:CMMC|DoD) (?:tool|partner|software)\b/i,
  /\btestimonial(?!s,)\b/i,
  /\btrusted by\b/i,
  /\b\d[\d,]* (?:shops|customers|contractors) (?:use|trust|rely)/i,
  /\bpass (?:your|the) (?:assessment|audit)\b/i,
];

test("copy guard: no certification, endorsement, guarantee or testimonial claims", () => {
  const texts = [
    ...PAGES.map((p) => [p.path, read(fileFor(p.path))]),
    ["llms.txt", read("llms.txt")],
  ];
  for (const [name, text] of texts) {
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const re of FORBIDDEN)
      assert.ok(!re.test(plain), `${name} matches ${re}: "${plain.match(re)?.[0]}"`);
  }
});

test("external links are registered sources (or the sibling product)", () => {
  const allowed = new Set([...SOURCES.map((s) => s.url), JOBSHOP.url]);
  for (const p of PAGES) {
    const html = read(fileFor(p.path));
    for (const [, href] of html.matchAll(/<a [^>]*href="(https?:[^"]+)"/g))
      assert.ok(allowed.has(href), `${p.path}: unregistered external link ${href}`);
  }
});

test("home states the $3k–25k range with its source and cross-links the job-shop product", () => {
  const home = read("index.html");
  assert.match(home, /\$3,000–\$25,000/);
  assert.match(home, /data-source="preveil-costs"/);
  for (const p of ["/", "/what-it-does"])
    assert.ok(read(fileFor(p)).includes(`href="${JOBSHOP.url}"`), p);
});

test("pricing compares against FutureFeed and PreVeil with sources, and says prices are proposals", () => {
  const pricing = read("pricing.html");
  assert.match(pricing, /data-source="futurefeed-pricing"/);
  assert.match(pricing, /data-source="preveil-pass"/);
  assert.match(pricing, /Early access is free/);
  assert.match(pricing, /prices we propose/);
});

test("early-access form posts without JavaScript and has consent and a honeypot", () => {
  const html = read("early-access.html");
  assert.match(html, /<form class="signup" method="post" action="\/cmmc\/api\/early-access">/);
  assert.match(html, /name="consent" value="yes" required/);
  assert.match(html, /name="website"/);
  assert.ok(!/<script(?! type="application\/ld\+json")/.test(html), "no executable scripts");
});
