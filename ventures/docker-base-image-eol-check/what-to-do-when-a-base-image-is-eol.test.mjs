import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./what-to-do-when-a-base-image-is-eol.html", import.meta.url), "utf8");
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
  assert.match(html, /<link rel="canonical" href="\.\/what-to-do-when-a-base-image-is-eol\.html">/);
});

test("does not claim a clean scan means no vulnerabilities", () => {
  // The venture's rule: this tool never claims to be a vulnerability scan.
  // The remediation guide carries the same discipline about its own advice.
  assert.match(html, /does not mean.*already vulnerable|No\. It means the release line/i);
});

test("tells the reader to pin the digest, not just re-tag, while waiting to upgrade", () => {
  assert.match(html, /content digest/i);
  assert.match(html, /docker-base-image-pin-check/);
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
  assert.match(indexHtml, /href="\.?\/?what-to-do-when-a-base-image-is-eol\.html"/);
});

test("is listed in the sitemap", () => {
  assert.match(sitemap, /what-to-do-when-a-base-image-is-eol\.html/);
});

test("links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
