// Build output checks: SEO tags, links, sitemap/llms.txt coverage, and the honesty rules in the copy.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { build, fileFor } from "../build.mjs";
import { BASE_PATH, PLATFORMS, SITE_URL, TIERS } from "../src/content.mjs";

let out;
let pages;
const base = () => join(out, BASE_PATH.slice(1));
const read = (rel) => readFileSync(join(base(), rel), "utf8");
const htmlOf = (page) => read(fileFor(page.path));

before(() => {
  out = mkdtempSync(join(tmpdir(), "seller-books-site-"));
  ({ pages } = build(out));
});
after(() => rmSync(out, { recursive: true, force: true }));

/** A served path under BASE_PATH → the file that serves it, or null for API endpoints. */
function fileForServed(path) {
  const rel = path.slice(BASE_PATH.length) || "/";
  if (rel.startsWith("/api/")) return null;
  if (/\.(txt|xml|css|svg)$/.test(rel)) return rel.slice(1);
  return fileFor(rel.replace(/\/$/, "") || "/");
}

describe("pages", () => {
  test("home, six platform pages, pricing, early access, llms.txt and sitemap exist", () => {
    const paths = pages.map((p) => p.path);
    for (const p of [
      "/",
      "/pricing",
      "/early-access",
      "/faq",
      "/schedule-c-worksheet",
      "/platforms",
    ]) {
      assert.ok(paths.includes(p), p);
    }
    for (const p of PLATFORMS) assert.ok(paths.includes(`/platforms/${p.slug}`), p.slug);
    assert.deepEqual(
      PLATFORMS.map((p) => p.name),
      ["eBay", "Poshmark", "Mercari", "Whatnot", "Depop", "Etsy"],
    );
    for (const f of ["llms.txt", "llms-full.txt", "sitemap.xml", "robots.txt", "404.html"]) {
      assert.ok(existsSync(join(base(), f)), f);
    }
    assert.ok(existsSync(join(out, "_headers")));
  });

  test("each page: one h1, a title, a description, canonical (or noindex), valid JSON-LD", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      assert.equal(html.match(/<h1[ >]/g)?.length, 1, `${page.path} h1`);
      assert.match(html, /<title>[^<]{5,70}<\/title>/, `${page.path} title`);
      const desc = /<meta name="description" content="([^"]+)">/.exec(html)?.[1];
      assert.ok(desc && desc.length <= 200, `${page.path} description`);
      if (page.noindex) assert.match(html, /noindex/);
      else
        assert.ok(
          html.includes(
            `<link rel="canonical" href="${SITE_URL}${page.path === "/" ? "/" : page.path}">`,
          ),
          page.path,
        );
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) {
        JSON.parse(m[1]);
      }
      // No executable script anywhere (CSP is script-src 'none').
      assert.equal(
        html.replace(/<script type="application\/ld\+json">.*?<\/script>/g, "").includes("<script"),
        false,
      );
    }
  });

  test("every internal link resolves to a built file", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      for (const m of html.matchAll(/(?:href|action)="(\/[^"#?]*)/g)) {
        assert.ok(m[1].startsWith(BASE_PATH), `${page.path}: ${m[1]} outside base path`);
        const file = fileForServed(m[1]);
        if (file) assert.ok(existsSync(join(base(), file)), `${page.path} → ${m[1]} (${file})`);
      }
    }
  });

  test("early-access form on home, every platform page, pricing and the form page", () => {
    const withForm = [
      "/",
      "/pricing",
      "/early-access",
      ...PLATFORMS.map((p) => `/platforms/${p.slug}`),
    ];
    for (const path of withForm) {
      const html = htmlOf(pages.find((p) => p.path === path));
      assert.match(html, /action="\/seller-books\/api\/early-access\/subscribe"/, path);
      assert.match(html, new RegExp(`name="source" value="${path}"`), path);
      assert.match(html, /name="website"[^>]*tabindex="-1"/, `${path} honeypot`);
    }
  });
});

describe("crawler files", () => {
  test("sitemap lists exactly the indexable pages", () => {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = pages
      .filter((p) => !p.noindex)
      .map((p) => `${SITE_URL}${p.path === "/" ? "/" : p.path}`);
    assert.deepEqual(locs, expected);
    assert.ok(!xml.includes("thanks"));
  });

  test("llms.txt links only to sitemap pages and states the honest framing", () => {
    const txt = read("llms.txt");
    const sitemap = read("sitemap.xml");
    for (const m of txt.matchAll(/\]\((https:[^)]+)\)/g)) {
      if (m[1].endsWith("llms-full.txt")) continue;
      assert.ok(sitemap.includes(`<loc>${m[1]}</loc>`), m[1]);
    }
    assert.match(txt, /^# Seller Books\n\n> /);
    assert.match(txt, /early access/);
    assert.match(txt, /not a tax adviser/);
    assert.match(txt, /working name/);
  });

  test("robots.txt allows the site, disallows the API, names AI crawlers and the sitemap", () => {
    const txt = read("robots.txt");
    assert.match(txt, /Disallow: \/seller-books\/api\//);
    for (const bot of ["ClaudeBot", "GPTBot", "PerplexityBot"])
      assert.match(txt, new RegExp(`User-agent: ${bot}`));
    assert.match(txt, /Sitemap: https:\/\/marisstella\.app\/seller-books\/sitemap\.xml/);
  });

  test("_headers sets a no-script CSP for the base path", () => {
    const h = readFileSync(join(out, "_headers"), "utf8");
    assert.match(h, /^\/seller-books\/\*$/m);
    assert.match(h, /script-src 'none'/);
    assert.match(h, /frame-ancestors 'none'/);
  });
});

describe("honesty rules", () => {
  const allText = () =>
    [...pages.map(htmlOf), read("llms.txt"), read("llms-full.txt")].join("\n").toLowerCase();

  test("every page says early access and not tax advice", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      assert.match(html, /early access/i, page.path);
      assert.match(html, /not a tax adviser/, page.path);
    }
  });

  test("no testimonials, ratings, savings claims or fear marketing", () => {
    const text = allText();
    for (const banned of [
      "testimonial",
      "aggregaterating",
      "reviewcount",
      "trusted by",
      "thousands of",
      "save you",
      "you'll save",
      "saves you",
      "audit-proof",
      "irs is watching",
      "irs is coming",
      "guarantee",
      "$600",
      "$5,000",
      "$2,500",
    ]) {
      assert.ok(!text.includes(banned), banned);
    }
  });

  test("1099-K: only the federal $20,000 / 200 threshold is stated", () => {
    const text = allText();
    for (const m of text.matchAll(/1099-k[^.]*\./g)) {
      const amounts = m[0].match(/\$[\d,]+/g) ?? [];
      for (const a of amounts) assert.equal(a, "$20,000", m[0]);
    }
    assert.match(text, /over \$20,000 and more than 200 transactions/);
  });

  test("the invented worked example adds up", () => {
    const html = htmlOf(pages.find((p) => p.path === "/"));
    assert.match(html, /An invented example/);
    assert.ok(Math.abs(40 - 6.1 - 5.25 - 8 - 20.65) < 1e-9);
    assert.match(html, /\$20\.65/);
  });
});

describe("pricing tiers", () => {
  test("move up by order volume and platforms; annual is ten months", () => {
    for (let i = 1; i < TIERS.length; i++) {
      assert.ok(TIERS[i].monthly > TIERS[i - 1].monthly);
      assert.ok(TIERS[i].orders > TIERS[i - 1].orders);
    }
    for (const t of TIERS) assert.equal(t.annual, t.monthly * 10, t.key);
    assert.ok(
      TIERS[0].monthly >= 10 && TIERS[0].monthly <= 20,
      "entry tier sits in the $10–20 wedge",
    );
  });

  test("pricing page shows every tier and says nothing is charged during early access", () => {
    const html = htmlOf(pages.find((p) => p.path === "/pricing"));
    for (const t of TIERS) assert.ok(html.includes(`$${t.monthly}`), t.key);
    assert.match(html, /nothing is charged/);
    assert.match(html, /[Pp]roposed/);
  });
});
