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
  for (const id of ["events", "churn", "asof"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  const mods = [...html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)].map((m) => m[1]);
  assert.ok(mods.includes("engine.mjs") && mods.includes("usage.mjs"));
  for (const m of mods) { assert.doesNotThrow(() => page(m), m); assert.doesNotMatch(page(m), /from "node:/, `${m} must run in a browser`); }
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the page never shows synthetic data as real", () => {
  assert.match(page("index.html"), /not real customers/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index links one hop to the cancel-flow sibling and each sibling exists", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/cancel-flow\/"/);
  for (const m of html.matchAll(/href="\.\.\/([a-z-]+)\/"/g)) assert.doesNotThrow(() => readFileSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
});

test("footer names pql-radar so no sibling is an orphan", () => { assert.match(page("index.html"), /href="\.\.\/pql-radar\/"/); });
