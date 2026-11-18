import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./nigeria-mbs-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the system, the authority and the sources' limits", () => {
  assert.match(html, /Nigeria Revenue Service/);
  assert.match(html, /Merchant Buyer Solution/);
  assert.match(html, /not from NRS circulars/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/nigeria-mbs-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="nigeria-mbs-e-invoice-mandate\.html"/);
  assert.match(sitemap, /nigeria-mbs-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to a neighbour and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="kenya-etims-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*nigeria-mbs-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("keeps the facts read from the NRS portal and marks the notice as reproduced (2026-11-14)", () => {
  const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");
  assert.match(html, /names UBL for invoices/);
  assert.match(html, /does not name Peppol/);
  assert.match(html, /invoice_kind field \(B2B, B2G or B2C\)/);
  assert.match(html, /go live 1 July 2026/);
  assert.match(html, /go live 1 July 2027/);
  // The rollout table was not read from NRS itself: the page says whose copy it is.
  assert.match(html, /as KPMG Nigeria reproduces/);
  assert.match(html, /answered this build host with a CAPTCHA/);
  assert.doesNotMatch(hub, /Peppol-aligned; format not confirmed/);
});
