import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, "vs-boxbrownie.html"), "utf8");
const indexHtml = readFileSync(path.join(here, "index.html"), "utf8");
const sitemap = readFileSync(path.join(here, "..", "sitemap.xml"), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not\s+legal,\s+compliance,\s+or\s+professional\s+advice/i);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /MIT\s*(<[^>]+>)?\s*licensed/i);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("states it is not affiliated with BoxBrownie", () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by BoxBrownie/);
});

test("no unverifiable price is claimed for BoxBrownie", () => {
  // BoxBrownie's own pricing pages are not reachable from this session to
  // confirm today's per-photo rates or plans, so only its well-documented
  // service category (paid photo editing, virtual staging, floor plans) is
  // stated -- same discipline vs-harvest.html and vs-snyk.html use for their
  // own competitors.
  assert.doesNotMatch(html, /BoxBrownie[^.]*\$\d/);
  assert.doesNotMatch(html, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(photo|image|month|mo|year|yr)/i);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-boxbrownie\.html" \/>/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1);
  const schema = JSON.parse(blocks[0]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 2);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the page never claims a network call, matching every other page on this static site", () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test("nothing is loaded from a third-party origin", () => {
  const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/([^"]+)"/g)].map((m) => m[2]);
  const allowed = external.filter((url) => url.startsWith("github.com/sponsors/"));
  assert.deepEqual(
    external.filter((url) => !allowed.includes(url)),
    [],
    "external resource references must stay empty",
  );
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-boxbrownie\.html"/);
});

test("the comparison page is listed in the venture-root sitemap", () => {
  assert.match(sitemap, /vs-boxbrownie\.html/);
});

test("the comparison page links back to the calculator and to the rejection explainer", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/why-was-my-listing-photo-rejected\.html"/);
});
