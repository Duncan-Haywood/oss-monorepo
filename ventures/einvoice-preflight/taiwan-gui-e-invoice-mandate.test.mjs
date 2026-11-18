import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./taiwan-gui-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the authority and the sources' limits", () => {
  assert.match(html, /Ministry of Finance/);
  assert.match(html, /Taiwan eGUI|the eGUI platform/);
  assert.match(html, /not from [^<]*(texts|notices|notifications|circulars)/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/taiwan-gui-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="taiwan-gui-e-invoice-mandate\.html"/);
  assert.match(sitemap, /taiwan-gui-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to a neighbour and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="south-korea-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*taiwan-gui-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("keeps the facts read from the VAT Act, the Regulations and the time-limit table (2026-11-14)", () => {
  const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");
  assert.match(html, /Article 32\(4\)/);
  assert.match(html, /one of five lawful kinds/);
  assert.match(html, /within 7 days when the buyer is a business and within 2 days when the buyer is not/);
  assert.match(html, /Article 48-2/);
  // The 48 hours of vendor guides is named only as not in the table.
  for (const m of html.matchAll(/[^.]*48 hours[^.]*\./g)) assert.match(m[0], /not in the table/);
  const row = hub.match(/<tr><th scope="row"><a href="taiwan-gui-e-invoice-mandate\.html">.*?<\/tr>/)[0];
  assert.doesNotMatch(row, /Disputed in sources|sources disagree/);
  assert.match(row, /7 days \(B2B\) or 2 days \(B2C\)/);
});
