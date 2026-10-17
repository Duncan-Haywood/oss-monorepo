import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const html = page("how-much-should-i-charge-for-a-voice-over-project.html");
const indexHtml = page("index.html");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or business advice/i);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-should-i-charge-for-a-voice-over-project\.html">/);
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

test("the guide page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="how-much-should-i-charge-for-a-voice-over-project\.html"/);
});

test("the guide page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

// Prose and arithmetic drift apart silently, so every figure quoted in the
// worked example is recomputed here from the same numbers used in the copy,
// rather than asserted by eye.
test("the worked-example figures match calc.mjs on the stated script and audiobook examples", async () => {
  const { computeProjectQuote, computeAudiobookQuote, USAGE_TERMS, USAGE_TERM_MULTIPLIERS } = await import("./calc.mjs");

  const byTerm = {};
  for (const term of USAGE_TERMS) {
    byTerm[term] = computeProjectQuote({ wordCount: 150, pricingMethod: "perWord", rate: 0.30, usageTerm: term });
  }
  assert.equal(byTerm.internal.baseFee, 45);
  assert.equal(byTerm.internal.total, 45);
  assert.equal(byTerm.web.total, 58.5);
  assert.equal(byTerm.broadcast_regional.total, 81);
  assert.equal(byTerm.broadcast_national.total, 123.75);
  assert.equal(byTerm.buyout.total, 180);
  assert.equal(USAGE_TERM_MULTIPLIERS.web, 1.3);
  assert.equal(USAGE_TERM_MULTIPLIERS.broadcast_regional, 1.8);
  assert.equal(USAGE_TERM_MULTIPLIERS.broadcast_national, 2.75);
  assert.equal(USAGE_TERM_MULTIPLIERS.buyout, 4);

  const audiobook = computeAudiobookQuote({ wordCount: 75000, ratePerFinishedHour: 250 });
  assert.equal(audiobook.finishedHours, 8.06);
  assert.equal(audiobook.narrationFee, 2016.13);
  assert.equal(audiobook.effectivePerWord, 0.03);

  assert.match(html, /\$45\.00/);
  assert.match(html, /\$58\.50/);
  assert.match(html, /\$81\.00/);
  assert.match(html, /\$123\.75/);
  assert.match(html, /\$180\.00/);
  assert.match(html, /\$135\.00/);
  assert.match(html, /8\.06/);
  assert.match(html, /\$2,016\.13/);
});
