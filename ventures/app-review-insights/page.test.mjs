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
  for (const id of ["file", "paste", "low", "drop", "minv"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page states what it does not do", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /keyword/i);
});

test("the inline module script parses", () => {
  const html = page("index.html");
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m);
  new Function(m[1].replace(/^\s*import .*$/gm, ""));
});

test("JSON-LD blocks parse", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) JSON.parse(b[1]);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the page links the neighbouring app-listing check", () => {
  // One-hop inbound link from app-listing-metadata-check keeps this page from being a crawlable orphan.
  assert.match(page("index.html"), /app-listing-metadata-check|app-subscription-proceeds-calculator/);
});
