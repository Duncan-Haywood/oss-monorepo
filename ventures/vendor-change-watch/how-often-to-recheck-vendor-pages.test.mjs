import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./how-often-to-recheck-vendor-pages.html", import.meta.url), "utf8");
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

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-often-to-recheck-vendor-pages\.html">/);
});

test("does not claim a fixed cadence is a guarantee", () => {
  // The venture's rule: a report never claims to interpret compliance for the
  // reader. The cadence guide carries the same discipline about its own advice.
  assert.match(html, /not a guarantee that following it would have caught any specific change/i);
});

test("states the same first-capture rule as the tool itself", () => {
  assert.match(html, /reported as .{0,10}captured/i);
  assert.match(html, /never as/i);
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

test("is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/how-often-to-recheck-vendor-pages\.html"/);
});

test("is listed in the sitemap", () => {
  assert.match(sitemap, /how-often-to-recheck-vendor-pages\.html/);
});

test("links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
