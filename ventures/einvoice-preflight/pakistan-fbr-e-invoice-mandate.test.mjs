import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./pakistan-fbr-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the authority and the sources' limits", () => {
  assert.match(html, /Federal Board of Revenue/);
  assert.match(html, /Pakistan FBR Digital Invoicing|FBR Digital Invoicing/);
  assert.match(html, /not from [^<]*(texts|notices|notifications|circulars)/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/pakistan-fbr-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="pakistan-fbr-e-invoice-mandate\.html"/);
  assert.match(sitemap, /pakistan-fbr-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to a neighbour and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="india-gst-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*pakistan-fbr-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("keeps the facts read from the FBR's notifications (2026-11-14)", () => {
  const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");
  assert.match(html, /S\.R\.O\. 69\(I\)\/2025 of 29 January 2025/);
  assert.match(html, /S\.R\.O\. 1413\(I\)\/2025 of 1 August 2025, superseding S\.R\.O\. 709\(I\)\/2025/);
  assert.match(html, /by 1 September 2025/);
  assert.match(html, /everyone else by 1 December 2025/);
  assert.match(html, /within 72 hours of generation/);
  assert.match(html, /section 33 of the Sales Tax Act/);
  // S.R.O. 1852 was not read: the page must keep it marked as reported.
  assert.match(html, /Reported, not read: S\.R\.O\. 1852\(I\)\/2025/);
  // The old Tier-1-retailers-only framing and the vendor "60 percent" claim as fact are gone.
  assert.doesNotMatch(html, /Tier-1 retailers first/);
  assert.match(html, /60 percent input tax cut that vendor guides mention is not in the rules read/);
  assert.doesNotMatch(hub, /FBR notices unread/);
});
