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

test("inputs have labels", () => {
  const html = page("index.html");
  for (const id of ["tx-file", "tx-paste", "plan-pct", "plan-cents", "intl-target"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("no source file the page loads can send the data anywhere", () => {
  for (const f of ["index.html", "calc.mjs", "usage.mjs"]) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|<form[^>]+action/, f);
  }
  const html = page("index.html");
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.doesNotMatch(html, /<img[^>]+src="https?:/);
});

test("page documents the model and what it leaves out, and is not a Shopify-affiliated claim", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /estimates that depend entirely on the file you provide/);
  assert.match(html, /Shopify is a trademark of Shopify Inc\./);
  assert.match(html, /not affiliated with, endorsed by or sponsored by Shopify/);
});

test("the what-if rates are editable inputs, not a claim about the current plan", () => {
  const html = page("index.html");
  assert.match(html, /id="plan-pct"/);
  assert.match(html, /not Shopify's current rates/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
