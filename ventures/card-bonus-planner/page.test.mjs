import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or accuracy guarantee/);
  assert.match(html, /not affiliated with or endorsed by any bank/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("the page makes no network requests and every input has a label", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  for (const id of ["today", "monthly", "o-name", "o-issuer", "o-date", "w-name", "w-issuer", "order", "gap"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
});

test("the page imports modules that exist and every getElementById target exists", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) assert.doesNotThrow(() => page(m[1]), m[1]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([a-z-]+)"\)/g)) assert.ok(ids.has(m[1]), `missing #${m[1]}`);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
