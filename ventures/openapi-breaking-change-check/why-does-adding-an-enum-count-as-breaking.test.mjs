import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./why-does-adding-an-enum-count-as-breaking.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a full compatibility audit/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/why-does-adding-an-enum-count-as-breaking\.html">/);
});

test("explains that restricting to an enum narrows what the API accepts", () => {
  assert.match(html, /accepted any value of its declared type/i);
  assert.match(html, /narrows/i);
});

test("states the general narrowing-vs-widening rule behind every verdict", () => {
  assert.match(html, /shrink what the API (?:will accept|accepts)/i);
});

test("distinguishes adding an enum value (non-breaking) from restricting to one (breaking)", () => {
  assert.match(html, /adding a value to an existing enum/i);
  assert.match(html, /non-breaking/i);
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

test("is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.?\/?why-does-adding-an-enum-count-as-breaking\.html"/);
});

test("is listed in the sitemap", () => {
  assert.match(sitemap, /why-does-adding-an-enum-count-as-breaking\.html/);
});

test("links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
