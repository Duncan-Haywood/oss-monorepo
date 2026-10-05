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

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "mapping", "split", "date-order", "tax-rate", "expected"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model, its limits, and that the layout is read from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of public help documents/);
  assert.match(html, /no real Paddle export and no live Xero or QuickBooks import was available/);
  });

test("page states it is independent of Paddle and accounting vendors", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with Paddle or any accounting vendor/);
  assert.match(html, /not sponsored, endorsed or connected/);
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

test("every FAQ question in the structured data is also visible on the page", () => {
  const html = page("index.html");
  const names = [...html.matchAll(/"name": ?"([^"]+\?)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 6);
  for (const n of names) assert.ok(html.includes(`<h3>${n}</h3>`), n);
});

test("the sample payouts load from the page and the account list defaults to the library's", () => {
  const html = page("index.html");
  assert.match(html, /sampleReport/);
  assert.match(html, /mappingText\(\)/);
});
