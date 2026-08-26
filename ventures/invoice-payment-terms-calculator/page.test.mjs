import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEarlyPay, compareFactor, earlyPayNote, factorNote } from "./calc.mjs";
import {
  SCHEDULE_PRESETS,
  compareSchedules,
  depositForPeakExposure,
  depositSchedule,
} from "./schedule.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const earlySeo = readFileSync(new URL("./should-i-offer-2-10-net-30.html", import.meta.url), "utf8");
const factorSeo = readFileSync(new URL("./should-i-factor-this-invoice.html", import.meta.url), "utf8");
const depositSeo = readFileSync(new URL("./should-i-ask-for-a-deposit.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

const money = (value) => {
  const [whole, frac] = value.toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
};

test("the calculator page wires due-date, late-fee, and 2/10 compare without a build step", () => {
  assert.match(html, /calculateTerms/);
  assert.match(html, /compareEarlyPay/);
  assert.match(html, /earlyPayNote/);
  assert.match(html, /id="earlyPayDays"/);
  assert.match(html, /id="earlyPayDiscountPct"/);
  assert.match(html, /id="annualCarryRate"/);
  assert.match(html, /id="takeRatePct"/);
  assert.match(html, /early_pay_compared/);
  assert.match(html, /compareFactor/);
  assert.match(html, /factorNote/);
  assert.match(html, /id="factorFeePct"/);
  assert.match(html, /factor_compared/);
  assert.match(html, /should-i-offer-2-10-net-30\.html/);
  assert.match(html, /should-i-factor-this-invoice\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /FAQPage/);
});

test("the 2/10 landing page uses the same worked example the tests lock", () => {
  const comparison = compareEarlyPay({
    amount: 1200,
    termsDays: 30,
    earlyPayDays: 10,
    earlyPayDiscountPct: 2,
    annualCarryRate: 24,
    takeRatePct: 100,
  });
  assert.match(earlySeo, /<title>Should I offer 2\/10 Net 30\?/);
  assert.match(earlySeo, /name="description"/);
  assert.match(earlySeo, /FAQPage/);
  assert.match(earlySeo, /href="\.\/"/);
  assert.match(earlySeo, /Best-effort hosting, no SLA/);
  assert.match(earlySeo, /\$1,176\.00/);
  assert.match(earlySeo, /\$1,168\.27/);
  assert.match(earlySeo, /\$1,176\.33/);
  assert.match(earlySeo, /\$8\.06/);
  assert.match(earlySeo, /36\.1%/);
  assert.match(earlySeo, /\$1,159\.89/);
  assert.match(earlySeo, /\$1,150\.68/);
  assert.match(earlySeo, /GitHub Sponsors/);
  assert.doesNotMatch(earlySeo, /must offer|must take|should take the discount/i);
  assert.equal(comparison.earlyCash, 1176);
  assert.equal(comparison.waitCash, 1200);
  assert.match(earlyPayNote(comparison), /\$1,176\.33/);
  assert.match(sitemap, /should-i-offer-2-10-net-30\.html/);
});

test("the calculator page wires the billing-schedule comparison", () => {
  assert.match(html, /compareSchedules/);
  assert.match(html, /depositForPeakExposure/);
  assert.match(html, /scheduleCopy/);
  assert.match(html, /scheduleNote/);
  for (const id of [
    "projectValue",
    "projectDays",
    "avgDaysLate",
    "depositCollectionDays",
    "depositPct",
    "exposureCeiling",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
  assert.match(html, /schedule_compared/);
  assert.match(html, /schedule_copied/);
  assert.match(html, /should-i-ask-for-a-deposit\.html/);
  assert.match(sitemap, /should-i-ask-for-a-deposit\.html/);
});

test("the schedule table scrolls inside its own box, not the page", () => {
  // This venture is edited by several sessions at once and these three rules
  // live in one dense <style> line, which is exactly the shape a merge drops
  // silently: nothing throws, no test fails, and the page just scrolls
  // sideways on a phone. A resolution that loses them fails here instead.
  assert.match(html, /class="scroller"/);
  assert.match(html, /\.scroller\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(html, /\.wide table\s*\{[^}]*min-width:/);
  // The mobile breakpoint has to collapse the schedule's own field grid too.
  // Matched on the breakpoint's own line: the rule body contains braces, so a
  // negated-brace scan would stop at the first nested rule and never reach it.
  const breakpoint = html.split("\n").find((line) => line.includes("@media (max-width: 700px)"));
  assert.ok(breakpoint, "the 700px breakpoint is missing");
  assert.match(breakpoint, /\.fields\.four/);
});

test("every schedule input the page collects is one the module reads", () => {
  // Derived from schedule.mjs rather than hand-listed, so a field added to the
  // model without a matching input fails here instead of silently defaulting.
  const source = readFileSync(new URL("./schedule.mjs", import.meta.url), "utf8");
  const read = [...source.matchAll(/shared\.(\w+)/g)].map((m) => m[1]);
  const suppliedElsewhere = new Set(["termsDays", "annualCarryRate"]); // set in the panel above
  for (const field of new Set(read)) {
    if (suppliedElsewhere.has(field)) {
      assert.match(html, new RegExp(`id="${field}"`));
      continue;
    }
    assert.match(
      html,
      new RegExp(`'${field}'`),
      `${field} is read by schedule.mjs but never collected by the page`,
    );
  }
});

/** The defaults the page ships and the landing page quotes. */
const DEPOSIT_DEFAULTS = {
  projectValue: 6000,
  projectDays: 30,
  termsDays: 30,
  avgDaysLate: 12,
  annualCarryRate: 24,
  depositCollectionDays: 5,
};

test("the deposit landing page's figures are recomputed, not remembered", () => {
  // A worked example is a claim about what the tool outputs. Asserting the
  // strings alone would let the page keep quoting numbers the model no longer
  // produces, so every figure below is derived here and then looked for.
  const schedules = [...SCHEDULE_PRESETS, depositSchedule(30)];
  const comparison = compareSchedules(schedules, DEPOSIT_DEFAULTS);
  const byId = Object.fromEntries(comparison.outcomes.map((o) => [o.id, o]));

  assert.match(depositSeo, /<title>Should I ask for a deposit\?/);
  assert.match(depositSeo, /name="description"/);
  assert.match(depositSeo, /FAQPage/);
  assert.match(depositSeo, /href="\.\/"/);
  assert.match(depositSeo, /Best-effort hosting, no SLA/);
  assert.match(depositSeo, /GitHub Sponsors/);

  // The headline table.
  assert.equal(byId["on-completion"].unpaidAtHandover, 6000);
  assert.equal(byId["half-deposit"].unpaidAtHandover, 3000);
  assert.equal(byId.thirds.unpaidAtHandover, 3960);
  for (const outcome of [byId["on-completion"], byId["half-deposit"], byId.thirds]) {
    assert.ok(
      depositSeo.includes(money(outcome.unpaidAtHandover)),
      `${outcome.label} unpaid figure ${money(outcome.unpaidAtHandover)} is not on the page`,
    );
    assert.ok(
      depositSeo.includes(money(outcome.fundingCost)),
      `${outcome.label} financing figure ${money(outcome.fundingCost)} is not on the page`,
    );
  }

  // The claim the page is built around: thirds is worse than a half deposit,
  // and the midpoint bill lands on day 57.
  assert.ok(byId.thirds.unpaidAtHandover > byId["half-deposit"].unpaidAtHandover);
  assert.equal(byId.thirds.milestones[1].paidDay, 57);
  assert.match(depositSeo, /day 57/);

  // Working the percentage backwards.
  assert.equal(depositForPeakExposure(2000, DEPOSIT_DEFAULTS), 66.67);
  assert.match(depositSeo, /66\.67% deposit/);
  assert.equal(depositForPeakExposure(999, DEPOSIT_DEFAULTS), null);
  assert.match(depositSeo, /below \$1,000/);

  // It reports, and never instructs.
  assert.doesNotMatch(depositSeo, /you should ask|always ask for|never bill|we recommend/i);
});

test("the slow-deposit collapse the landing page describes still happens", () => {
  const slow = { ...DEPOSIT_DEFAULTS, depositCollectionDays: 42 };
  const comparison = compareSchedules([...SCHEDULE_PRESETS, depositSchedule(30)], slow);
  for (const outcome of comparison.outcomes) {
    assert.equal(outcome.unpaidAtHandover, 6000, `${outcome.label} should be fully exposed`);
  }
  const half = comparison.outcomes.find((o) => o.id === "half-deposit");
  const once = comparison.outcomes.find((o) => o.id === "on-completion");
  assert.ok(depositSeo.includes(money(half.fundingCost)));
  assert.ok(depositSeo.includes(money(once.fundingCost - half.fundingCost)));
});

test("the factoring landing page uses the same worked example the tests lock", () => {
  const comparison = compareFactor({
    amount: 1200,
    termsDays: 30,
    factorFeePct: 3,
    advancePct: 90,
    reserveDays: 35,
    annualCarryRate: 24,
  });
  assert.match(factorSeo, /<title>Should I factor this invoice\?/);
  assert.match(factorSeo, /name="description"/);
  assert.match(factorSeo, /FAQPage/);
  assert.match(factorSeo, /href="\.\/"/);
  assert.match(factorSeo, /Best-effort hosting, no SLA/);
  assert.match(factorSeo, /\$1,044\.00/);
  assert.match(factorSeo, /\$1,161\.24/);
  assert.match(factorSeo, /\$1,176\.33/);
  assert.match(factorSeo, /\$15\.09/);
  assert.match(factorSeo, /1\.74%/);
  assert.match(factorSeo, /\$1,158\.25/);
  assert.match(factorSeo, /\$1,150\.68/);
  assert.match(factorSeo, /GitHub Sponsors/);
  assert.doesNotMatch(factorSeo, /must factor|should factor this|must wait/i);
  assert.equal(comparison.fee, 36);
  assert.equal(comparison.advanceNow, 1044);
  assert.match(factorNote(comparison), /\$1,176\.33/);
  assert.match(sitemap, /should-i-factor-this-invoice\.html/);
});
