import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./singapore-invoicenow-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the dates and says what is unconfirmed", () => {
  assert.match(html, /1 Nov 2025/);
  assert.match(html, /1 Apr 2026/);
  assert.match(html, /1 Apr 2031/);
  assert.match(html, /runs OpenPeppol's Singapore PINT rules/);
  assert.match(html, /not found|could not confirm|unconfirmed/i);
});

test("makes no price claim", () => {
  assert.doesNotMatch(html, /(?<!S)\$\d/); // S$ figures are turnover thresholds, not prices
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/singapore-invoicenow-e-invoice-mandate\.html">/);
});

test("FAQPage schema is valid JSON and matches visible h3 headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(match, "no schema");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text));
  }
});

test("linked from the tool page and listed in the sitemap", () => {
  assert.match(indexHtml, /href="singapore-invoicenow-e-invoice-mandate\.html"/);
  assert.match(sitemap, /singapore-invoicenow-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("sitemap entry is its own url block and the hub row is present", () => {
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*singapore-invoicenow-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
  assert.match(fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8"), /href="singapore-invoicenow-e-invoice-mandate\.html"/);
});
