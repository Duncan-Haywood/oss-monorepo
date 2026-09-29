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
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /no SLA/i);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index page names both 2026 rates and the mid-year change", () => {
  const html = page("index.html");
  assert.match(html, /72\.5 cents/);
  assert.match(html, /76 cents/);
  assert.match(html, /July 1/);
});

test("every id the script queries exists in the markup", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/\$\("#([a-z0-9-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("page wires calc and usage modules and counts a calculation", () => {
  const html = page("index.html");
  assert.match(html, /from "\.\/calc\.mjs"/);
  assert.match(html, /record\("deduction_calculated"\)/);
});
