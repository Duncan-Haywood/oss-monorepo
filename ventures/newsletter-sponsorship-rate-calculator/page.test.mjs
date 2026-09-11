import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find every page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /newsletter-sponsorship-rate-benchmarks\.html/);
});

// Closest cross-venture sibling: a self-published author with a mailing list
// is a common overlap with a newsletter operator, and each tool prices a
// different revenue lever on the same audience. Related-tool chrome rotates
// by category, so without an explicit one-hop a crawler on this page may
// never land on that tool (platform/pages/siblings.test.mjs's orphan budget).
test("index links one hop to the kdp-royalty-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/kdp-royalty-calculator\/"/,
    "index must link ../kdp-royalty-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /KDP royalty calculator/i);
});

// Reciprocal of brand-deal-rate-calculator's own inbound link to this
// venture: closes the sibling pair so platform/pages/siblings.mjs --check
// counts neither tool as a crawlable orphan.
test("index links one hop to the brand-deal-rate-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/brand-deal-rate-calculator\/"/,
    "index must link ../brand-deal-rate-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /brand deal rate calculator/i);
});
