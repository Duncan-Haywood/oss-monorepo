import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./malta-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the position, flags the sources and names the format", () => {
  assert.match(html, /voluntary/);
  assert.match(html, /1 Jul 2030/);
  assert.match(html, /Legal Notices 403 and 404 of 2018/);
  assert.match(html, /Peppol BIS Billing 3\.0/);
  assert.match(html, /EN 16931/);
  assert.match(html, /not the legal notices/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /EUR \d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/malta-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="malta-e-invoice-mandate\.html"/);
  assert.match(sitemap, /malta-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to Belgium and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="belgium-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*malta-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});
