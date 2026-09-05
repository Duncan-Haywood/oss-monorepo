import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-avalara.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = fs.readFileSync(new URL("./robots.txt", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("states it is not affiliated with Avalara", () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Avalara/);
});

test("no unverifiable price is claimed for Avalara", () => {
  // Avalara's own current pricing page is not reachable from this session.
  // A web search surfaced well-documented, non-numeric identity facts
  // (founding year 2004, category: cloud tax-compliance platform covering
  // calculation, returns filing, exemption certificates, and e-invoicing)
  // but no current dollar figure from Avalara's own site, so none is
  // invented here -- same discipline vs-smartmoving.html uses for
  // SmartMoving. No dollar figure appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/vs-avalara\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-avalara\.html"/);
});

test("the comparison page is listed in the sitemap and allowed by robots", () => {
  assert.match(sitemap, /vs-avalara\.html/);
  assert.match(robots, /Allow: \//);
});

test("the comparison page links back to the checker and the rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});
