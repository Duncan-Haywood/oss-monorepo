import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every default has a labelled input and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide", () => {
  assert.match(page("index.html"), /Not decided/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("page says its defaults are placeholders", () => {
  assert.match(page("index.html"), /placeholders, not/i);
});

test("comparison page: FAQ matches JSON-LD, disclaimer present, linked from index, sitemap and llms.txt", () => {
  const name = "vs-working-it-out-by-hand.html";
  const html = page(name);
  const faq = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(faq["@type"], "FAQPage");
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
  assert.match(html, /<title>[^<]{20,}/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(page("index.html"), new RegExp(name));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("llms.txt"), new RegExp(name));
});
