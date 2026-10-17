import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-building-your-own-spreadsheet.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("names no specific spreadsheet application or vendor", () => {
  assert.doesNotMatch(html, /google sheets|excel|airtable|notion/i);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="vs-building-your-own-spreadsheet\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?\n\s*\})\s*<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-building-your-own-spreadsheet\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-building-your-own-spreadsheet\.html/);
});

test("the comparison page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});
