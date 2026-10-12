import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, financial-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, banking, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Financial data/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and nothing can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "mapping", "platform", "split", "date-order", "tax-rate", "expected"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model, its limits, and that the layouts are read from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of public help documents/);
  assert.match(html, /no real export and no live Xero or QuickBooks import was available/);
});

test("page states it is independent of the platforms and accounting vendors", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with any platform or accounting vendor/);
  assert.match(html, /not sponsored, endorsed or connected/);
});

test("every platform the hub reads is named on the page and links to its own tool", () => {
  const html = page("index.html");
  for (const slug of ["airbnb-payout", "amazon-settlement", "ebay-payout", "etsy-statement", "gumroad-sales", "kdp-royalty", "paypal-activity", "shopify-payout", "square-sales", "stripe-payout"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}-to-journal/"`), slug);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_validated", "example_loaded", "csv_downloaded", "journal_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  for (const m of page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  }
});
