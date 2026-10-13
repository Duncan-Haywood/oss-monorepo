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
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /FAQPage/);
});

test("inputs have labels and nothing can send the answers anywhere", () => {
  const html = page("index.html");
  for (const id of ["product", "role", "size", "sellsInEu", "reasons", "now"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /delegated act/);
  assert.match(html, /regulator/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded", "csv_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every input id the script reads exists, and every one is a key the calculator reads", async () => {
  const html = page("index.html");
  const { SAMPLE } = await import("./calc.mjs");
  const ids = [...html.match(/const ids = \[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.ok(id in SAMPLE, id);
  }
});

test("every passport item has a select on the page", async () => {
  const html = page("index.html");
  const { DPP_ITEMS } = await import("./calc.mjs");
  for (const d of DPP_ITEMS) assert.match(html, new RegExp(`id="${d.id}"`), d.id);
});

test("footer links the related EU tools", () => {
  const html = page("index.html");
  for (const s of ["eu-green-claims-checker", "eu-packaging-regulation-checker", "eu-battery-regulation-checker", "eu-price-reduction-claim-checker"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
