import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const html = page("vs-the-10-dollars-per-1000-followers-rule.html");
const indexHtml = page("index.html");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, legal, tax, or/i);
});

test("carries the nothing-leaves-your-browser disclaimer", () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="vs-the-10-dollars-per-1000-followers-rule\.html">/);
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

test("the FAQPage JSON-LD answers are verbatim on the page (word for word)", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-the-10-dollars-per-1000-followers-rule\.html"/);
});

test("the page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

test("the page links to the benchmarks guide page", () => {
  assert.match(html, /href="\.\/brand-deal-rate-benchmarks\.html"/);
});

// The worked-example table is the whole argument of this page, so every
// figure in it is recomputed here from calculator.mjs rather than checked by
// eye -- if the benchmark table ever changes, this test forces the copy to
// change with it instead of quietly going stale.
test("the worked-example figures match calculator.mjs on the stated inputs", async () => {
  const { computeRates } = await import("./calculator.mjs");

  const flatRule = (followers) => (followers / 1000) * 10;

  const typical = computeRates({ followers: 50000, engagementRate: 2, platform: "instagram" });
  assert.equal(typical.engagedFollowers, 1000);
  assert.equal(typical.rates.post.low, 10);
  assert.equal(typical.rates.post.high, 20);
  assert.equal(flatRule(50000), 500);

  const highlyEngaged = computeRates({ followers: 8000, engagementRate: 15, platform: "tiktok" });
  assert.equal(highlyEngaged.engagedFollowers, 1200);
  assert.equal(highlyEngaged.rates.reel.low, 7);
  assert.equal(highlyEngaged.rates.reel.high, 18);
  assert.equal(flatRule(8000), 80);

  assert.match(html, /\$500/);
  assert.match(html, /\$10\s*&ndash;\s*\$20/);
  assert.match(html, /\$80/);
  assert.match(html, /\$7\s*&ndash;\s*\$18/);
});
