import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./compare-multiple-offers.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty and not-advice disclaimers", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
  assert.match(html, /does not tell anyone which offer to accept/);
});

test("says the fall-through chances are the seller's and the example rows are invented", () => {
  assert.match(html, /example rows are invented/);
  assert.match(html, /ships no statistics/);
});

test("imports the ranking engine from calc.mjs and counts usage once, only after the visitor edits", () => {
  assert.match(html, /import\s*\{\s*rankOffers\s*\}\s*from\s*"\.\/calc\.mjs"/);
  assert.match(html, /userTouched && !counted/);
  assert.match(html, /count\("offers_ranked"\)/);
});

test("builds user-typed labels with textContent or input values, never innerHTML", () => {
  assert.doesNotMatch(html, /innerHTML/);
});

test("the result panel is an aria-live region and the controls are labelled", () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
  assert.match(html, /aria-label/);
});

test("canonical names this file and the sitemap lists it", () => {
  assert.match(html, /<link rel="canonical" href="compare-multiple-offers\.html">/);
  assert.match(sitemap, /\/seller-net-sheet\/compare-multiple-offers\.html/);
});

test("the home page links to it", () => {
  assert.match(indexHtml, /href="compare-multiple-offers\.html"/);
});

test("FAQ JSON-LD questions are all visible on the page", () => {
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((j) => j["@type"] === "FAQPage");
  assert.ok(ld.mainEntity.length >= 3);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), q.name);
  }
});
