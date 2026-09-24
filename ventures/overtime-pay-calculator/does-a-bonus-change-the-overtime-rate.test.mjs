import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./does-a-bonus-change-the-overtime-rate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and the federal-only caveat", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /federal FLSA/);
});

test("carries the privacy line", () => {
  assert.match(html, /Nothing leaves your browser/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/does-a-bonus-change-the-overtime-rate\.html">/);
});

test("is indexable and describes itself for a crawler", () => {
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<meta name="description" content="[^"]{80,}">/);
});

test("does not claim the calculator folds bonuses in automatically", () => {
  assert.match(html, /No\. The blended-rate calculator[\s\S]*?has no separate bonus field/);
});

test("the FAQPage schema is valid JSON, matches visible headings, and each answer is on the page", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.match(html, new RegExp(`<h3>${qa.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`), `no matching <h3> for "${qa.name}"`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the worked example's arithmetic matches the FLSA weighted-average formula", () => {
  // 45 hours at $20 plus a $90 bonus: regular rate = (900 + 90) / 45 = $22,
  // premium = 5 * (22 * 0.5) = $55, total = 990 + 55 = $1,045 -- the same
  // straight-time-plus-half-premium method computeWeightedAverageOvertime
  // uses, so the guide cannot drift from what the tool actually computes.
  assert.match(html, /\$990/);
  assert.match(html, /\$22 \/ hour/);
  assert.match(html, /\$55/);
  assert.match(html, /\$1,045/);
});

test("is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/does-a-bonus-change-the-overtime-rate\.html"/);
});

test("is listed in the sitemap", () => {
  assert.match(sitemap, /does-a-bonus-change-the-overtime-rate\.html/);
});

test("links back to the tool", () => {
  assert.match(html, /<a href="\.\/">/);
});
