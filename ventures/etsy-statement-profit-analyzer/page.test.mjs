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

test("inputs have labels and the page never sends the files anywhere", () => {
  const html = page("index.html");
  for (const id of ["statement-file", "statement-paste", "items-file", "items-paste", "costs"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page documents the model and what it leaves out, and is not an Etsy-affiliated claim", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /estimates that depend entirely on the files you provide/);
  assert.match(html, /not affiliated with, endorsed by or sponsored by Etsy/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
