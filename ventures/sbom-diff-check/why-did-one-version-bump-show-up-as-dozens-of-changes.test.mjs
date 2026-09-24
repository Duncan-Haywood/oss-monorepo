import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./why-did-one-version-bump-show-up-as-dozens-of-changes.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a security audit, a vulnerability scan, or a compliance attestation/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/why-did-one-version-bump-show-up-as-dozens-of-changes\.html">/);
});

test("explains the cascade is usually expected, not a sign of breakage", () => {
  assert.match(html, /Not by itself/i);
  assert.match(html, /re-resolved the tree/i);
});

test("tells the reader how to check whether a row is a real surprise", () => {
  assert.match(html, /npm ls/);
  assert.match(html, /dependency-tree command/i);
});

test("warns against wiring --fail-on-change into an ordinary CI pipeline", () => {
  assert.match(html, /--fail-on-change/);
  assert.match(html, /trains a team to ignore the gate/i);
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
  assert.match(indexHtml, /href="\.?\/?why-did-one-version-bump-show-up-as-dozens-of-changes\.html"/);
});

test("is listed in the sitemap", () => {
  assert.match(sitemap, /why-did-one-version-bump-show-up-as-dozens-of-changes\.html/);
});

test("links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
