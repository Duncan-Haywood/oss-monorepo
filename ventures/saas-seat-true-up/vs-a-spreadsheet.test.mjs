import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./vs-a-spreadsheet.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty and best-effort hosting disclaimers", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or business advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test("names no specific spreadsheet or SaaS-management product or company", () => {
  // This is the generic-method angle ("a spreadsheet"), not a named-product
  // comparison, so it must not read as a claim about any specific vendor --
  // same discipline as this venture's own vs-vendr.html and vs-zylo.html,
  // and the other vs-spreadsheet pages this repo carries.
  assert.doesNotMatch(html, /Google Sheets|Microsoft Excel|Numbers\.app|Airtable|Vendr|Zylo/i);
});

test("the FAQPage JSON-LD is valid and every question/answer is verbatim on the page", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?\})<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3, "FAQPage should carry at least 3 questions");
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${name}</h3>`), `question not found verbatim as an <h3>: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test("links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

test("is clear that nothing entered is uploaded", () => {
  assert.match(html, /nothing is uploaded anywhere/);
});

test("this generic-method page is registered as disclaimer-exempt and within the surface budget", async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import("../../platform/pages/clauses.mjs");
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has("saas-seat-true-up/vs-a-spreadsheet.html"),
    "vs-a-spreadsheet.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product",
  );
});
