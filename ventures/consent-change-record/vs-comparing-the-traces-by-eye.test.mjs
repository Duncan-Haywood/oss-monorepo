import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareTraces } from "./calc.mjs";

const page = readFileSync(new URL("./vs-comparing-the-traces-by-eye.html", import.meta.url), "utf8");

test("carries the no-warranty and nothing-leaves-your-browser clauses", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /Nothing leaves your browser/);
});

test("names no vendor or competing product as the point of comparison", () => {
  // Compares against the generic habit of comparing two trace exports by
  // eye -- not a company or product this could be mistaken for. The single
  // cross-link to this venture's own vs-cookiebot.html (which does name
  // Cookiebot/Usercentrics and carries the trademark disclaimer) is
  // expected and does not make this page a named-product comparison
  // itself.
  assert.doesNotMatch(page, /usercentrics|onetrust|didomi|osano|termly/i);
  // Excludes the "vs-cookiebot.html" href itself, which also matches a bare
  // /cookiebot/i scan -- only the visible link text is the comparison surface.
  assert.equal((page.match(/(?<!vs-)cookiebot(?!\.html)/gi) ?? []).length, 1, "expected exactly one cross-link mention of Cookiebot, not a comparison against it");
});

test("the canonical tag names this file", () => {
  assert.match(page, /<link rel="canonical" href="\.\/vs-comparing-the-traces-by-eye\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the worked example figures match calc.mjs's compareTraces against the described traces", () => {
  // Same worked example the page walks through -- pinned directly against
  // compareTraces() so the page's claimed numbers cannot drift from what
  // the tool itself would report.
  const before = {
    site: "https://example.test",
    capturedAt: "2026-09-24T09:00:00Z",
    browser: "Chromium 128 / en-US",
    sequence: "before-consent",
    requests: [
      { url: "https://cdn.example.test/app.js", method: "GET" },
      { url: "https://analytics.example.test/collect", method: "POST" },
      { url: "https://analytics.example.test/collect", method: "POST" },
      { url: "https://analytics.example.test/collect", method: "POST" },
    ],
    storage: [{ key: "consent_state" }],
  };
  const after = {
    site: "https://example.test",
    capturedAt: "2026-09-24T09:01:00Z",
    browser: "Chromium 128 / en-US",
    sequence: "after-reject-analytics",
    requests: [
      { url: "https://cdn.example.test/app.js", method: "GET" },
      { url: "https://analytics.example.test/collect", method: "POST" },
    ],
    storage: [{ key: "consent_state" }, { key: "_ga" }],
  };

  const report = compareTraces(before, after);

  assert.equal(report.requests.removed.length, 2, "expected 2 of the 3 analytics requests to be reported removed");
  assert.ok(
    report.requests.removed.every((r) => r.url === "https://analytics.example.test/collect" && r.method === "POST"),
    "the removed requests must all be the analytics collect endpoint",
  );
  assert.equal(report.requests.added.length, 0, "no request is entirely new in this example");
  assert.ok(
    report.requests.unchanged.some((r) => r.url === "https://analytics.example.test/collect"),
    "one instance of the analytics request must still be reported unchanged -- it did not disappear, it reduced",
  );
  assert.deepEqual(report.storage.added, [{ key: "_ga" }]);
  assert.deepEqual(report.storage.removed, []);
});

test("index.html links to the comparison page", () => {
  const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/vs-comparing-the-traces-by-eye\.html"/);
});

test("sitemap.xml lists the comparison page", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-comparing-the-traces-by-eye\.html/);
});

test("links back to the tool and to the other comparison page", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /href="vs-cookiebot\.html"/);
});
