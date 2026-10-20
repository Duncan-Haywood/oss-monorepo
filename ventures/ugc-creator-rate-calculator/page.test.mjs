import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /FAQPage/);
});

test("inputs have labels and nothing can send the figures anywhere", () => {
  const html = page("index.html");
  for (const id of ["tier", "format", "niche", "videos", "usage", "whitelist", "exclusivity", "rawFootage", "rush", "extraHooks", "extraRevisions", "productCost"]) assert.match(html, new RegExp(`<label for="${id}"`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide and that it is a rule of thumb", () => {
  const html = page("index.html");
  assert.match(html, /Not decided here/);
  assert.match(html, /Rule-of-thumb multipliers, not a market survey/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["quote_built", "example_loaded", "quote_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every form id the script reads exists and sample keys cover them", async () => {
  const html = page("index.html");
  const { SAMPLE } = await import("./calc.mjs");
  const ids = html.match(/const ids = \[([^\]]*)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.ok(id in SAMPLE, id);
  }
});

test("sibling creator tools are linked one hop", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/brand-deal-rate-calculator\/"/);
  assert.match(html, /href="\.\.\/influencer-media-kit-generator\/"/);
});
