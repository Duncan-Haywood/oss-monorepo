import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-changedetection-io.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, compliance, procurement, or security advice/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("states it is not affiliated with changedetection.io", () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by changedetection\.io/);
});

test("no unverifiable price is claimed for changedetection.io", () => {
  // changedetection.io's own hosted-service pricing is not reachable from
  // this session to confirm, so no dollar figure for it is invented here --
  // same discipline vs-snyk.html uses for Snyk's own pricing.
  assert.doesNotMatch(html, /\$\d/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-changedetection-io\.html">/);
});

test("does not claim the tool can fetch or live-compare against changedetection.io", () => {
  assert.match(html, /makes no live connection to changedetection\.io/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-changedetection-io\.html"|href="vs-changedetection-io\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-changedetection-io\.html/);
});

test("the comparison page links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
