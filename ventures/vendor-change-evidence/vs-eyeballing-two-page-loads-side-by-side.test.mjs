import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReport } from "./evidence.js";

const page = readFileSync(new URL("./vs-eyeballing-two-page-loads-side-by-side.html", import.meta.url), "utf8");

test("names no vendor or competing product", () => {
  // Generic mental model (eyeballing two page loads), not a named
  // competitor -- distinct from this venture's own vs-upguard.html, which
  // names UpGuard and carries its own "not affiliated" clause.
  assert.doesNotMatch(page, /UpGuard/i);
});

test("carries the no-warranty and nothing-leaves-your-browser clauses", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /Nothing leaves your browser/);
});

test("links back to the tool and the SEO explainer", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /href="\.\/how-do-i-track-vendor-policy-changes\.html"/);
});

test("the canonical tag names this file", () => {
  assert.match(page, /<link rel="canonical" href="\.\/vs-eyeballing-two-page-loads-side-by-side\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the FAQPage JSON-LD answers are verbatim on the page (word for word)", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the worked example matches this venture's own shipped fixtures and evidence.js exactly", () => {
  const before = readFileSync(new URL("./examples/before.json", import.meta.url), "utf8");
  const after = readFileSync(new URL("./examples/after.json", import.meta.url), "utf8");
  const report = buildReport(before, after);

  assert.equal(report.status, "changed");
  assert.equal(report.review_required, true);
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0].kind, "content_changed");
  assert.equal(report.changes[0].before_length, 47);
  assert.equal(report.changes[0].after_length, 57);

  assert.match(page, /47/);
  assert.match(page, /57/);
  assert.match(page, /We process account data to provide the service\./);
  assert.match(page, /We process account and usage data to provide the service\./);
});

test("states the fetch_status inconclusive behavior correctly", () => {
  // Mirrors evidence.js's own compare(): either snapshot not "ok" is
  // inconclusive, never a false "unchanged".
  assert.match(page, /inconclusive/);
  assert.match(page, /fetch_status/);
});

test("index.html links to the comparison page", () => {
  const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/vs-eyeballing-two-page-loads-side-by-side\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-eyeballing-two-page-loads-side-by-side\.html/);
});
