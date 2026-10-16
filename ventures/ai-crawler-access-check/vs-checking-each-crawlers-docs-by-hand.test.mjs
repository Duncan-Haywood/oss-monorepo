import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-checking-each-crawlers-docs-by-hand.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a guarantee that any crawler will honor/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /MIT licen[cs]e/i);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("names no specific company or product", () => {
  // This page compares against a manual habit, not a named competitor, so it
  // relies on COMPARISON_DISCLAIMER_EXEMPT in clauses.mjs rather than the
  // trademark "not affiliated with" clause -- pin the sentence that keeps
  // the exemption true, same discipline as the other exempted pages
  // (dependency-confusion-check/vs-checking-configs-by-hand.html among them).
  assert.match(html, /Names no specific company or product/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-each-crawlers-docs-by-hand\.html">/);
});

test("does not claim the by-hand method is fraudulent, only unverifiable", () => {
  assert.match(html, /not wrong so much as unverifiable/i);
});

test("states the concrete, domain-specific failure modes of a by-hand check", () => {
  assert.match(html, /twelve separate operators publishing/i);
  assert.match(html, /longest-matching-path-wins algorithm/i);
  assert.match(html, /blocking the training token does nothing to the other two/i);
  assert.match(html, /leaves nothing behind afterward/i);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the FAQPage answers appear verbatim on the visible page, not only in the script tag", () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-checking-each-crawlers-docs-by-hand\.html"|href="vs-checking-each-crawlers-docs-by-hand\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-checking-each-crawlers-docs-by-hand\.html/);
});

test("the comparison page links back to the tool", () => {
  assert.match(html, /<a class="back" href="\.\/">/);
});

test("the page is static: no script src, no network call", () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test("no unverifiable price, subscription figure, or traction claim", () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /\d+\s*(users|customers|companies|downloads)/i);
});
