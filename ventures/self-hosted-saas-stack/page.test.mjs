import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { render } from "./build.mjs";
import { ALL } from "./stack.mjs";

const here = (p) => new URL(p, import.meta.url);
const html = readFileSync(here("./index.html"), "utf8");

test("index.html is the output of build.mjs", () => {
  assert.equal(html, render());
});

test("every listed tool is a real venture and is linked", () => {
  const seen = new Set();
  for (const t of ALL) {
    assert.ok(!seen.has(t.slug), `duplicate ${t.slug}`);
    seen.add(t.slug);
    assert.ok(existsSync(here(`../${t.slug}/VENTURE.yaml`)), t.slug);
    assert.ok(html.includes(`href="../${t.slug}/"`), t.slug);
  }
});

test("every *-keeper venture is listed", () => {
  const keepers = readdirSync(here("../")).filter((d) => d.endsWith("-keeper"));
  const listed = new Set(ALL.map((t) => t.slug));
  for (const k of keepers) assert.ok(listed.has(k), `${k} is missing from stack.mjs`);
});

test("page carries the disclaimer, privacy line, and sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("structured data parses and the FAQ matches the page", () => {
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  assert.equal(ld.find((x) => x["@type"] === "ItemList").numberOfItems, ALL.length);
});

test("title and description are search-sized and the page makes no network requests", () => {
  assert.ok(/<title>(.*?)<\/title>/.exec(html)[1].length <= 110);
  assert.ok(/<meta name="description" content="(.*?)">/.exec(html)[1].length <= 320);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|<script src/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(readFileSync(here("./robots.txt"), "utf8"), /Allow: \//);
  assert.match(readFileSync(here("./sitemap.xml"), "utf8"), /index\.html/);
});
