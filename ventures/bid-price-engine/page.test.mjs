import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("index carries the disclaimer, privacy line and sponsor link, and sends nothing", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("JSON-LD parses and the FAQ matches the visible FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every form control has a label and user text is escaped before innerHTML", () => {
  const html = page("index.html");
  for (const id of ["trade", "labor", "materials", "burden", "waste", "subs", "equip", "miles", "mile-rate", "cont", "over", "margin", "rival", "deposit", "oh-annual", "oh-direct", "co-name", "co-hours", "co-materials", "co-subs", "co-equip", "co-revenue"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.match(html, /const esc = /);
  assert.match(html, /esc\(e\.message\)/);
});

test("the guide's conversion table is correct", () => {
  const html = page("markup-vs-margin.html");
  assert.match(html, /<td>25%<\/td><td>33\.3%<\/td><td>\$133\.33<\/td>/);
  assert.match(html, /<td>25%<\/td><td>20\.0%<\/td><td>\$125\.00<\/td>/);
});

test("robots and sitemap let crawlers find both pages", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("sitemap.xml"), /markup-vs-margin\.html/);
});
