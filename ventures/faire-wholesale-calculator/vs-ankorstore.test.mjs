import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-ankorstore.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("states it is not affiliated with Ankorstore", () => {
  assert.match(html, /Not affiliated with Ankorstore/);
});

test("no unverifiable dollar figure is claimed for Ankorstore", () => {
  // Ankorstore's own current rate card is not reachable from this session.
  // A web search surfaced well-documented, non-numeric identity facts
  // (founded November 2019, Paris, unicorn status backed by Index Ventures,
  // a January 2026 move to 0% commission on reorders per its own published
  // update) but no dollar figure this page treats as current, so none is
  // invented here. The only "$" on the page is Faire's own published $10
  // new-customer fee, which the rest of this venture's pages already state.
  const dollarFigures = html.match(/\$\d[\d,.]*/g) ?? [];
  for (const figure of dollarFigures) {
    assert.equal(figure, "$10", `unexpected dollar figure on the page: ${figure}`);
  }
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="vs-ankorstore\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?\n\s*\})\s*<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-ankorstore\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-ankorstore\.html/);
});

test("the comparison page links back to the calculator and the Faire Direct explainer", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="faire-direct-vs-marketplace\.html"/);
});
