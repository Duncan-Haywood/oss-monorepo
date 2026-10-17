import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const html = page("how-much-should-i-charge-for-an-interpreting-assignment.html");
const indexHtml = page("index.html");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, medical, or[\s\S]*financial advice/i);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-should-i-charge-for-an-interpreting-assignment\.html">/);
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
  assert.match(indexHtml, /href="how-much-should-i-charge-for-an-interpreting-assignment\.html"/);
});

test("the guide page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

// Prose and arithmetic drift apart silently, so every figure quoted in the
// worked example is recomputed here from the same numbers used in the copy,
// rather than asserted by eye.
test("the worked-example figures match calc.mjs on the stated bookings", async () => {
  const { computeAssignmentQuote, computeCancellationFee } = await import("./calc.mjs");

  const shortBooking = computeAssignmentQuote({ hoursRequested: 1.5, hourlyRate: 65 });
  assert.equal(shortBooking.billableHours, 2);
  assert.equal(shortBooking.minimumApplied, true);
  assert.equal(shortBooking.interpretingFee, 130);
  assert.equal(shortBooking.total, 130);
  assert.equal((1.5 * 65).toFixed(2), "97.50");
  assert.equal((shortBooking.total - 1.5 * 65).toFixed(2), "32.50");

  const legalSingle = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 65, setting: "legal" });
  assert.equal(legalSingle.interpretingFee, 195);
  assert.ok(legalSingle.findings.some((f) => f.id === "team-interpreting-recommended"));

  const legalTeam = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 65, setting: "legal", teamInterpreting: true });
  assert.equal(legalTeam.interpretingFee, 390);

  const shortNotice = computeCancellationFee({ scheduledFee: 200, hoursNotice: 18 });
  assert.equal(shortNotice.feeOwed, 200);
  assert.equal(shortNotice.feePercentage, 100);

  const longerNotice = computeCancellationFee({ scheduledFee: 200, hoursNotice: 30 });
  assert.equal(longerNotice.feeOwed, 100);
  assert.equal(longerNotice.feePercentage, 50);

  assert.match(html, /\$97\.50/);
  assert.match(html, /\$130\.00/);
  assert.match(html, /\$32\.50/);
  assert.match(html, /\$195\.00/);
  assert.match(html, /\$390\.00/);
  assert.match(html, /\$200\.00/);
  assert.match(html, /\$100\.00/);
});
