import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./vs-a-spreadsheet.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty and best-effort hosting disclaimers", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test("names no specific spreadsheet product or company", () => {
  // This is the generic-method angle ("a spreadsheet" / "IRS Pub. 560 by
  // hand"), not a named-product comparison, so it must not read as a claim
  // about any specific vendor -- same discipline as the other vs-a-
  // spreadsheet pages this repo carries.
  assert.doesNotMatch(html, /Google Sheets|Microsoft Excel|Numbers\.app|Airtable|Vertex42|Smartsheet/i);
});

test("the FAQPage JSON-LD is valid and every question/answer is verbatim on the page", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?\})<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3, "FAQPage should carry at least 3 questions");
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${name}</h3>`), `question not found verbatim as an <h3>: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"/);
});

test("the comparison page is listed in the venture's sitemap", () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test("states the circular 20%/25% conversion and the age-60-63 catch-up distinction", () => {
  assert.match(html, /25% \/ 1\.25 = 20%|dividing by\s*\n?\s*1 plus the stated rate/);
  assert.match(html, /\$11,250/);
  assert.match(html, /\$8,000/);
});
