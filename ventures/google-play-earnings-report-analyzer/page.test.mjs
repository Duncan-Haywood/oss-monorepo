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
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and the page never sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "feepct", "base", "rates"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files, so nothing is loaded from a network host", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /Assumptions \(edit these\)/);
  assert.match(html, /estimates that depend entirely on the file you provide and the assumptions you enter/);
});

test("page states the column names are matched by alias from memory", () => {
  assert.match(page("index.html"), /matched by alias from memory of Play Console reports/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the currency inputs are labelled", () => {
  const html = page("index.html");
  for (const id of ["feepct", "base", "rates"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("page states it is independent of Google and links to the price-impact calculator", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with Google/);
  assert.match(html, /not sponsored, endorsed or connected to Google LLC\./);
  assert.match(html, /\.\.\/subscription-price-impact\//);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["report_analyzed", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});
