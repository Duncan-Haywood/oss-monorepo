import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const html = page("how-much-does-turo-take-from-hosts.html");
const indexHtml = page("index.html");

test("carries the no-warranty and not-affiliated disclaimers", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not\s+affiliated\s+with/i);
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-does-turo-take-from-hosts\.html">/);
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
  assert.match(indexHtml, /href="how-much-does-turo-take-from-hosts\.html"/);
});

test("the guide page links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

// Prose and arithmetic drift apart silently, so every figure quoted in the
// worked example is recomputed here from the same numbers used in the copy,
// rather than asserted by eye.
test("the worked-example figures match calc.mjs on the stated $350 trip", async () => {
  const { comparePlans, compareBookingWindows, estimateMonthly } = await import("./calc.mjs");

  const base = { tripPrice: 350, extraMileageFee: 0, lateReturnFee: 0, additionalUsageFee: 0, days: 1 };

  const plans = comparePlans({ ...base, bookingWindow: "3_13", selectedPlan: "balanced" });
  const byPlan = Object.fromEntries(plans.rows.map((r) => [r.plan, r]));
  assert.equal(byPlan.peace_of_mind.hostPayout, 245);
  assert.equal(byPlan.balanced.hostPayout, 280);
  assert.equal(byPlan.more_earnings.hostPayout, 315);
  assert.equal(plans.swing, 70);

  const windows = compareBookingWindows({ ...base, plan: "balanced", selectedWindow: "3_13" });
  const byWindow = Object.fromEntries(windows.rows.map((r) => [r.bookingWindow, r]));
  assert.equal(byWindow["0_2"].hostPayout, 262.5);
  assert.equal(byWindow["3_13"].hostPayout, 280);
  assert.equal(byWindow["14_27"].hostPayout, 297.5);
  assert.equal(byWindow["28_plus"].hostPayout, 315);
  assert.equal(windows.swing, 52.5);

  const monthly = estimateMonthly(byPlan.balanced.hostPayout, 6);
  assert.equal(monthly.monthly, 1680);
  assert.equal(monthly.annual, 20160);

  assert.match(html, /\$245\.00/);
  assert.match(html, /\$280\.00/);
  assert.match(html, /\$315\.00/);
  assert.match(html, /\$70\.00/);
  assert.match(html, /\$262\.50/);
  assert.match(html, /\$297\.50/);
  assert.match(html, /\$52\.50/);
  assert.match(html, /\$1,680\.00/);
  assert.match(html, /\$20,160\.00/);
});
