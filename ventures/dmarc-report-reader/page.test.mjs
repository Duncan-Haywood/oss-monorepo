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
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("file input has a label and the page makes no network requests", () => {
  const html = page("index.html");
  assert.match(html, /<label for="files">/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) assert.doesNotThrow(() => page(m[1]), m[1]);
});

test("the built-in example parses and produces a failing third-party sender", async () => {
  const { parseReport, summarize } = await import("./analyze.mjs");
  const xml = page("index.html").match(/const EXAMPLE = `([\s\S]*?)`;/)[1];
  const s = summarize([parseReport(xml)]);
  assert.equal(s.total, 1095);
  assert.equal(s.failingSources.length, 2);
  assert.match(s.recommendation, /Stay at p=none/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
