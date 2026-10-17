import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /FAQPage/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /Not decided/);
});

test("nothing can send the pasted text anywhere", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("extract.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./extract.mjs", "./sample.mjs", "./shred.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["matrix_built", "example_loaded", "csv_downloaded", "outline_downloaded", "draft_checked"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every id the script reads exists on the page", () => {
  const html = page("index.html");
  for (const [, id] of page("index.html").matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(html.includes(`id="${id}"`), id);
});

test("pasted text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  assert.doesNotMatch(html, /\$\{r\.text\}|\$\{i\.text\}/);
});

test("links the sibling tender tools and is crawlable", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/tender-bid-readiness\/"/);
  assert.match(html, /href="\.\.\/recompete-radar\/"/);
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
