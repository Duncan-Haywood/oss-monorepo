import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./jordan-jofotara-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the authority and the sources' limits", () => {
  assert.match(html, /Income and Sales Tax Department/);
  assert.match(html, /Jordan JoFotara|JoFotara/);
  assert.match(html, /not from [^<]*(texts|notices|notifications|circulars)/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/jordan-jofotara-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="jordan-jofotara-e-invoice-mandate\.html"/);
  assert.match(sitemap, /jordan-jofotara-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to a neighbour and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="kenya-etims-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*jordan-jofotara-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("keeps the facts read from Regulation No. 34 of 2019 and its instructions (2026-11-14)", () => {
  const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");
  assert.match(html, /Official Gazette 5572, 1 May 2019/);
  assert.match(html, /Regulation No\. 13 of 2023 \(Official Gazette 5851, 16 April 2023\)/);
  assert.match(html, /worth at least JOD 1/);
  assert.match(html, /under JOD 75,000/);
  assert.match(html, /bread-only bakeries under JOD 150,000/);
  assert.match(html, /kept four years/);
  // The old claim that buyer details are not required below JOD 10,000 misread the text.
  assert.doesNotMatch(html, /not required on invoices below JOD 10,000/);
  assert.match(html, /Above JOD 10,000 the seller must prove the buyer received it/);
  // Regulation No. 2 of 2025 was not found: still marked as reported.
  assert.match(html, /Reported, not read/);
  assert.doesNotMatch(hub, /ISTD unread/);
});
