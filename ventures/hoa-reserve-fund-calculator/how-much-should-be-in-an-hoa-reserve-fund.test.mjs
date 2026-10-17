import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const html = page("how-much-should-be-in-an-hoa-reserve-fund.html");
const indexHtml = page("index.html");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-should-be-in-an-hoa-reserve-fund\.html">/);
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
  assert.match(indexHtml, /href="\.\/how-much-should-be-in-an-hoa-reserve-fund\.html"/);
});

test("the guide page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

// Prose and arithmetic drift apart silently, so every figure quoted in the
// worked example is recomputed here from calc.mjs's own DEFAULTS, rather
// than asserted by eye.
test("the worked-example figures match calc.mjs on the DEFAULTS scenario", async () => {
  const { DEFAULTS, runSchedule, minimumContributionToAvoidShortfall, perUnitImpact } = await import("./calc.mjs");

  const doNothing = runSchedule(DEFAULTS);
  assert.equal(doNothing[0].balance, 193000);
  assert.ok(Math.abs(doNothing[0].percentFunded - 0.27936991228436137) < 1e-9);
  assert.equal(doNothing[0].specialAssessmentTriggered, true);
  assert.ok(Math.abs(doNothing[29].balance - -2890659.6398521885) < 1e-6);

  const minContribution = minimumContributionToAvoidShortfall(DEFAULTS);
  assert.equal(minContribution, 118760.31);

  const fixed = runSchedule({ ...DEFAULTS, annualContribution: minContribution });
  assert.ok(!fixed.some((r) => r.specialAssessmentTriggered));
  assert.ok(Math.abs(fixed[29].balance - 304494.8544513725) < 1e-6);

  const impact = perUnitImpact(DEFAULTS);
  assert.equal(impact.shortfallYear, 1);
  assert.ok(Math.abs(impact.oneTimeSpecialAssessmentPerUnit - 118.76747023809511) < 1e-9);
  assert.ok(Math.abs(impact.monthlyDuesIncreasePerUnit - 54.69465972222222) < 1e-9);

  assert.match(html, /\$150,000\.00/);
  assert.match(html, /\$40,000\.00/);
  assert.match(html, /\$193,000\.00/);
  assert.match(html, /27\.9%/);
  assert.match(html, /-\$2,890,659\.64|&minus;\$2,890,659\.64/);
  assert.match(html, /\$118,760\.31/);
  assert.match(html, /\$304,494\.85/);
  assert.match(html, /\$118\.77/);
  assert.match(html, /\$54\.69/);
});
