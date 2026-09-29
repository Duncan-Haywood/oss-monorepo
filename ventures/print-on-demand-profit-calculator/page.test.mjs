import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("every form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["platform", "price", "shipCharged", "baseCost", "shipCost", "refundPct", "adSpend", "sampleCost", "customPct", "customFixed", "offsiteShare", "offsitePct", "targetMarginPct", "orders", "summary"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("page is not advice, marks fee rates as reference to verify, and disclaims affiliation", () => {
  const html = page("index.html");
  assert.match(html, /This is not tax, legal or financial advice/);
  assert.match(html, /verify against the platform's current fee page/);
  assert.match(html, /Not modelled/);
  assert.match(html, /not sponsored, endorsed or connected to any of them/);
});

test("the platform select offers exactly the platforms the calculator has", () => {
  const html = page("index.html");
  const opts = [...html.match(/<select id="platform">([\s\S]*?)<\/select>/)[1].matchAll(/value="(\w+)"/g)].map((m) => m[1]).sort();
  const keys = [...page("calc.mjs").match(/export const PLATFORMS = \{([\s\S]*?)\n\};/)[1].matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]).sort();
  assert.deepEqual(opts, keys);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["profit_calculated", "example_loaded", "csv_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("page links to the sibling tools it names, and those tools exist", () => {
  const html = page("index.html");
  for (const slug of ["etsy-profit-calculator", "shopify-fee-calculator", "ebay-fee-calculator", "marketplace-fee-compare"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
    assert.ok(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8").length > 0);
  }
});
