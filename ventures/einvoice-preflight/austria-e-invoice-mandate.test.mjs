import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./austria-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the B2G dates, says B2B is voluntary and flags the sources", () => {
  assert.match(html, /1 Jan 2014/);
  assert.match(html, /18 Apr 2020/);
  assert.match(html, /1 Jul 2030/);
  assert.match(html, /voluntary/);
  assert.match(html, /ebInterface/);
  assert.match(html, /Peppol/);
  assert.match(html, /EN 16931/);
  assert.match(html, /vendor and guide pages/);
  assert.match(html, /does not read ebInterface/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /EUR \d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/austria-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="austria-e-invoice-mandate\.html"/);
  assert.match(sitemap, /austria-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to Belgium and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="belgium-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*austria-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});
