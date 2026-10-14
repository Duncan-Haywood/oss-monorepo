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
  for (const id of ["taxDue", "filed", "paid", "rate"]) assert.match(html, new RegExp(`<label for="${id}"`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide and tells the reader to verify", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /accountant or HMRC/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every map id exists on the page and is read by the calculator", async () => {
  const html = page("index.html");
  const { SAMPLE } = await import("./calc.mjs");
  const map = html.match(/const map = \{([^}]*)\}/)[1];
  for (const [, id, key] of map.matchAll(/(\w+): "(\w+)"/g)) {
    assert.ok(html.includes(`id="${id}"`), id);
    assert.ok(key in SAMPLE, key);
  }
});

test("sibling tools linked from the page exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(readFileSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("links the Self Assessment tax calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/uk-self-assessment-tax-calculator\/"/);
});
