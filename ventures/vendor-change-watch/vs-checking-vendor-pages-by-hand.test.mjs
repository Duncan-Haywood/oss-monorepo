import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-checking-vendor-pages-by-hand.html", import.meta.url), "utf8");
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

test("names no specific company or product", () => {
  // This page compares against a manual habit, not a named competitor, so it
  // relies on COMPARISON_DISCLAIMER_EXEMPT in clauses.mjs rather than the
  // trademark "not affiliated with" clause -- pin the sentence that keeps
  // the exemption true, same discipline as the other exempted pages.
  assert.match(html, /Names no specific company or product/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-vendor-pages-by-hand\.html">/);
});

test("does not claim the by-hand method is fraudulent, only unverifiable", () => {
  // The point is a fair comparison, not disparagement of a method every
  // practitioner already uses.
  assert.match(html, /not wrong so much as unverifiable/i);
});

test("states the three concrete failure modes of a by-hand check", () => {
  assert.match(html, /memory is not a diff/i);
  assert.match(html, /a failed check looks identical to a\s*\n?\s*clean one/i);
  assert.match(html, /there is no record afterward/i);
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
  assert.match(indexHtml, /href="\.\/vs-checking-vendor-pages-by-hand\.html"|href="vs-checking-vendor-pages-by-hand\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-checking-vendor-pages-by-hand\.html/);
});

test("the comparison page links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
