import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./thailand-rd-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the authority and the sources' limits", () => {
  assert.match(html, /Revenue Department/);
  assert.match(html, /Thailand e-Tax Invoice|e-Tax Invoice/);
  assert.match(html, /not from [^<]*(texts|notices|notifications|circulars)/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("makes no price or fine claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/thailand-rd-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="thailand-rd-e-invoice-mandate\.html"/);
  assert.match(sitemap, /thailand-rd-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to a neighbour and the hub and the sitemap entry is its own url block", () => {
  assert.match(html, /href="kenya-etims-e-invoice-mandate\.html"/);
  assert.match(html, /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*thailand-rd-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("keeps the facts read from the Revenue Department's notifications (2026-11-14)", () => {
  const hub = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");
  assert.match(html, /Royal Gazette vol\. 140, special part 167 Ng, 12 July 2023/);
  assert.match(html, /has the right to choose to make the tax invoice or receipt as electronic data or on paper/);
  assert.match(html, /form BO\.01/);
  assert.match(html, /by the 15th of the following month/);
  assert.match(html, /Notification on income tax No\. 470/);
  assert.match(html, /up to THB 200,000 for rooftop solar/);
  assert.doesNotMatch(hub, /Revenue Department notices unread/);
});
