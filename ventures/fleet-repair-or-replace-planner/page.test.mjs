import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, tax, legal, or engineering advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find both pages", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /is-it-cheaper-to-repair-or-replace-a-work-truck\.html/);
});

test("the page carries every field planRow accepts, plus the budget, and imports calc.mjs", () => {
  const html = page("index.html");
  for (const id of [
    "f-name", "f-annualRepairSpend", "f-downtimeDays", "f-dailyLostRevenue",
    "f-replacementCost", "f-resaleValue", "f-expectedLifeYears",
    "f-annualRepairOnNew", "f-downtimeDaysOnNew", "f-budget",
    "load-example", "clear", "export-csv", "optout", "assumptions",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ ASSUMPTIONS, planFleet, toCsv, sampleRows \} from "\.\/calc\.mjs"/);
});

// Every numeric input is a money or day count that cannot be negative, and a
// missing `min` lets a browser's own spinner walk a user into a figure the
// module then silently floors to 0 -- an input the page accepted and the
// arithmetic ignored is worse than one it refused.
test("every numeric input is bounded at zero and carries a step", () => {
  const html = page("index.html");
  const numeric = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0]);
  // Eight on the asset form plus the capital budget.
  assert.ok(numeric.length >= 9, `expected the whole form, found ${numeric.length}`);
  for (const tag of numeric) {
    assert.match(tag, /min="0"/, `missing min="0": ${tag}`);
    assert.match(tag, /step="/, `missing step: ${tag}`);
  }
});

// The 48 axe `label` violations CLAUDE.md records across three live products
// were all route-table inputs announced to a screen reader as "edit, number"
// and nothing else. Every input here is paired with a <label for>.
test("every input has a label bound to its id", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}"`), `#${id} has no bound label`);
  }
});

test("the page makes no network request at all, which is what the privacy line claims", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

test("the explainer page links back to the planner and carries the disclaimer", () => {
  const html = page("is-it-cheaper-to-repair-or-replace-a-work-truck.html");
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

// The explainer's worked example is the same scenario as calc.mjs's
// sampleRows(), so a change to the arithmetic that did not update the prose
// would leave a published page quoting figures the tool no longer produces.
test("the explainer's worked figures match what the module actually computes", async () => {
  // Prose is hard-wrapped, so a phrase can straddle a newline. Collapse
  // whitespace before matching rather than writing \s+ into every pattern.
  const html = page("is-it-cheaper-to-repair-or-replace-a-work-truck.html").replace(/\s+/g, " ");
  const { planRow, sampleRows } = await import("./calc.mjs");
  const [van3, excavator, van1] = sampleRows().map(planRow);

  assert.equal(van3.keepAnnualCost, 19000);
  assert.match(html, /\$19,000 \/ yr/);
  assert.equal(van3.replaceAnnualCost, 6287.5);
  assert.match(html, /\$6,287\.50 \/ yr/);
  assert.equal(van3.annualSaving, 12712.5);
  assert.match(html, /\$12,712\.50/);
  assert.equal(van3.paybackYears, 2.95);
  assert.match(html, /2\.95 years/);
  assert.equal(van3.savingPerDollar, 0.34);
  assert.match(html, /\$0\.34 a year per dollar/);

  assert.equal(excavator.annualSaving, 7600);
  assert.match(html, /\$7,600 a year on \$49,000/);
  assert.equal(excavator.savingPerDollar, 0.16);
  assert.match(html, /returns \$0\.16/);

  assert.equal(van1.keepAnnualCost, 2700);
  assert.equal(van1.replaceAnnualCost, 4125);
  assert.match(html, /\$2,700 a year to keep against \$4,125/);
});

test("index links the explainer page and the sitemap lists it too", () => {
  assert.match(page("index.html"), /is-it-cheaper-to-repair-or-replace-a-work-truck\.html/);
  assert.match(page("sitemap.xml"), /is-it-cheaper-to-repair-or-replace-a-work-truck\.html/);
});

// Sibling-orphan budget (platform/pages/siblings.test.mjs,
// siblings-budget.json) is 0, so a tool ships with a one-hop link in BOTH
// directions in the commit that graduates it, not as an orphan to close
// later. equipment-lease-buyout-calculator is the genuine pairing: it prices
// one asset's buyout against return-and-replace, this page decides which of
// several assets to act on at all.
test("index links one hop to the equipment-lease-buyout-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/equipment-lease-buyout-calculator\/"/,
    'index must link ../equipment-lease-buyout-calculator/ so crawlers reach it in one hop',
  );
});
