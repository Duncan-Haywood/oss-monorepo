import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page makes no network requests", () => {
  const html = page("index.html");
  for (const id of ["mode", "when", "len", "ext", "tpl", "n", "amt", "r0", "r1"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) {
    assert.doesNotThrow(() => page(m[1]), m[1]);
    assert.doesNotMatch(page(m[1]), /from "node:/, `${m[1]} must run in a browser`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
