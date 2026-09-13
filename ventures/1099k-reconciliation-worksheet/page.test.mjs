import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find both pages", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /why-is-my-1099-k-higher-than-what-i-actually-made\.html/);
});

test("the page carries every field reconcileRow accepts, and imports calc.mjs correctly", () => {
  const html = page("index.html");
  for (const id of [
    "f-platform", "f-box1a", "f-refunds", "f-salesTax", "f-fees", "f-cogs", "f-shipping",
    "load-example", "clear", "export-csv", "optout", "copy-link", "share-status",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ reconcileAll, toCsv, sampleRows \} from "\.\/calc\.mjs"/);
  assert.match(html, /import \{ encodeRows, decodeRows \} from "\.\/share\.mjs"/);
});

test("a shared link's row data never leaves the browser, and the promise names the event", () => {
  const html = page("index.html");
  assert.match(html, /encodes your rows into this page's own URL fragment/);
  assert.match(html, /link_copied/);
});

test("the explainer page links back to the worksheet and carries the disclaimer", () => {
  const html = page("why-is-my-1099-k-higher-than-what-i-actually-made.html");
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("index links the explainer page and the sitemap lists it too", () => {
  const html = page("index.html");
  const sitemap = page("sitemap.xml");
  assert.match(html, /why-is-my-1099-k-higher-than-what-i-actually-made\.html/);
  assert.match(sitemap, /why-is-my-1099-k-higher-than-what-i-actually-made\.html/);
});

// Sibling-orphan budget (platform/pages/siblings.test.mjs, siblings-budget.json):
// a tool ships with an inbound link from an existing sibling in the same
// commit, not as an orphan to close later. quarterly-estimated-tax-calendar
// is the genuine pairing -- both serve a self-employed marketplace seller at
// two different points of the same tax year.
test("index links one hop to the quarterly-estimated-tax-calendar sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/quarterly-estimated-tax-calendar\/"/,
    'index must link ../quarterly-estimated-tax-calendar/ so crawlers reach it in one hop',
  );
});
