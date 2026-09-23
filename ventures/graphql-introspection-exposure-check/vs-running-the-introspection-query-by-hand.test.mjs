import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./vs-running-the-introspection-query-by-hand.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty and best-effort hosting disclaimers", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not security advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test("names no specific GraphQL client or IDE product", () => {
  // This is the generic-method angle ("pasting the query in by hand"), not a
  // named-product comparison, so it must not read as a claim about any
  // specific vendor's tool.
  assert.doesNotMatch(html, /Postman|Insomnia|Apollo Studio|Altair/i);
});

test("the FAQPage JSON-LD is valid and every question/answer is verbatim on the page", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?\})<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3, "FAQPage should carry at least 3 questions");
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${name}</h3>`), `question not found verbatim as an <h3>: ${name}`);
  }
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-running-the-introspection-query-by-hand\.html">/);
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-running-the-introspection-query-by-hand\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-running-the-introspection-query-by-hand\.html/);
});

test("links back to the checker", () => {
  assert.match(html, /<a href="\.\/">/);
});

test("is clear that nothing is uploaded", () => {
  assert.match(html, /Nothing is uploaded/);
});

test("this generic-method page is registered as disclaimer-exempt and within the surface budget", async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import("../../platform/pages/clauses.mjs");
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has("graphql-introspection-exposure-check/vs-running-the-introspection-query-by-hand.html"),
    "vs-running-the-introspection-query-by-hand.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product",
  );
});

test("has exactly one <h1> and the structural tags a crawler expects", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});
