import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./vs-comparing-effective-rates.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty clause and names what it is not advice about", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, accounting, or legal advice/);
});

test("names no specific processor or company", () => {
  // This is the generic-method angle (comparing effective rates, a habit
  // every rate-shopping guide recommends), not a named-product comparison,
  // so it must not read as a claim about any specific vendor -- same
  // discipline as this venture's own vs-helcim page, which names Helcim
  // only in its dedicated, non-exempt comparison.
  assert.doesNotMatch(html, /Square|Stripe|Clover|Toast|Helcim|PayPal|Fiserv|Worldpay|Chase Paymentech/i);
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
  assert.match(html, /<link rel="canonical" href="\.\/vs-comparing-effective-rates\.html">/);
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-comparing-effective-rates\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-comparing-effective-rates\.html/);
});

test("links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

test("is clear that nothing entered is uploaded", () => {
  assert.match(html, /there is no network request in the page at all/);
});

test("this generic-method page is registered as disclaimer-exempt and within the surface budget", async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import("../../platform/pages/clauses.mjs");
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has("card-processing-fee-audit/vs-comparing-effective-rates.html"),
    "vs-comparing-effective-rates.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product",
  );
});
