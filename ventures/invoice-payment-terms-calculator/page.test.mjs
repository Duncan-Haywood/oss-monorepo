import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEarlyPay, compareFactor, compareLateInvoice, earlyPayNote, factorNote } from "./calc.mjs";
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

// faire-wholesale-calculator's Pay Now page already links here as the
// generic early-pay path. Without the reverse link, a crawler entering on
// this page never reaches the Faire-specific sibling — same one-way
// orphan class as #3639 / #3641 / #3650.
test("the 2/10 page links to the related Faire Pay Now early-pay page", () => {
  assert.match(
    earlySeo,
    /href="\.\.\/faire-wholesale-calculator\/should-i-offer-faire-pay-now\.html"/,
    "2/10 page must link the Faire Pay Now sibling so crawlers can reach it",
  );
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
const lateSeo = readFileSync(new URL("./chasing-a-late-invoice.html", import.meta.url), "utf8");

test("the overdue page wires all four paths and their break-evens without a build step", () => {
  assert.match(lateSeo, /compareLateInvoice/);
  assert.match(lateSeo, /lateInvoiceNote/);
  ["amount", "daysOverdue", "annualCarryRate", "hourlyRate", "waitDays", "waitRecoveryPct",
   "chaseHours", "chaseDays", "chaseRecoveryPct", "settlementDiscountPct", "settlementDays",
   "settlementRecoveryPct", "collectionCommissionPct", "collectionDays", "collectionRecoveryPct",
  ].forEach(id => assert.match(lateSeo, new RegExp(`id="${id}"`), `missing input ${id}`));
  assert.match(lateSeo, /late_invoice_compared/);
  assert.match(lateSeo, /id="usageOptOut"/);
  assert.match(lateSeo, /<title>Is it worth chasing a late invoice\?/);
  assert.match(lateSeo, /name="description"/);
  assert.match(lateSeo, /FAQPage/);
  assert.match(lateSeo, /href="\.\/"/);
  assert.match(lateSeo, /No warranty/);
  assert.match(lateSeo, /Best-effort hosting, no SLA/);
  assert.match(lateSeo, /GitHub Sponsors/);
});

test("the overdue page's worked example is the arithmetic the tests lock", () => {
  const comparison = compareLateInvoice({
    amount: 1200, daysOverdue: 15, annualCarryRate: 24, hourlyRate: 85,
    waitDays: 30, waitRecoveryPct: 70,
    chaseHours: 3, chaseDays: 14, chaseRecoveryPct: 85,
    settlementDiscountPct: 10, settlementDays: 5, settlementRecoveryPct: 80,
    collectionCommissionPct: 30, collectionDays: 90, collectionRecoveryPct: 45,
  });
  assert.equal(comparison.best.key, "settle");
  ["$861.16", "$823.43", "$755.61", "$355.63", "$255.00", "$1,188.95", "1.8 hours"]
    .forEach(figure => assert.ok(lateSeo.includes(figure), `page is missing ${figure}`));
  assert.equal(comparison.best.expected.toFixed(2), "861.16");
  assert.equal(comparison.breakEven.chaseHours.toFixed(1), "1.8");
});

test("the overdue page tells nobody to settle, escalate, or write the debt off", () => {
  assert.doesNotMatch(lateSeo, /you should (settle|sue|escalate|write)/i);
  assert.doesNotMatch(lateSeo, /guaranteed|we recommend|legally required to pay/i);
  assert.match(lateSeo, /does not tell you to settle, escalate, or walk away/);
  assert.match(sitemap, /chasing-a-late-invoice\.html/);
});

test("the calculator page links the overdue sibling so it is reachable from the hub", () => {
  assert.match(html, /chasing-a-late-invoice\.html/);
});

test("an invalid input clears every stale field in the main panel, not just the cash-landing and factoring panels", () => {
  // A prior fix (#1729) taught update()'s catch block to blank the
  // cash-landing and factoring panels, but left #exposure, #runway, the fee
  // #scenarios table, #copyText, and the early-pay comparison
  // (#earlyCash/#earlyAfter/#waitCash/#waitAfter/#earlyPayText) showing the
  // last valid calculation next to the error message in #due. A visitor who
  // missed that one line could read the stale figures as the answer for the
  // invalid inputs now on screen.
  const catchMatch = html.match(/\} catch \(error\) \{([\s\S]*?)\n\s*\}\n\s*\}\n\s*const moneyGrouped/);
  assert.ok(catchMatch, "update()'s catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /\$\('due'\)\.textContent = error\.message/, "the error message is never shown");
  assert.match(body, /\$\('exposure'\)\.textContent = ''/, "#exposure keeps its stale value instead of being cleared");
  assert.match(body, /\$\('runway'\)\.textContent = ''/, "#runway keeps its stale value instead of being cleared");
  assert.match(body, /\$\('scenarios'\)\.replaceChildren\(\)/, "the stale fee-scenario rows are not cleared");
  assert.match(body, /\$\('copyText'\)\.textContent = ''/, "#copyText keeps its stale note instead of being cleared");
  for (const id of ["earlyCash", "earlyAfter", "waitCash", "waitAfter"]) {
    assert.match(body, new RegExp(`'${id}'`), `#${id} is not cleared in the catch block`);
  }
  assert.match(body, /\$\('earlyPayText'\)\.textContent = ''/, "#earlyPayText keeps its stale note instead of being cleared");
});

test("wide money tables scroll inside their own box, not the phone viewport", () => {
  // Verified at 390px in a real browser: page overflow 0 on both siblings.
  // A grid item defaults to min-width:auto, so without the min-width:0 rule a
  // nowrap table widens the whole column and the page scrolls sideways.
  assert.match(lateSeo, /\.layout > section \{ min-width: 0/);
  assert.match(lateSeo, /\.scroller \{ overflow-x: auto/);
  assert.match(lateSeo, /<div class="scroller">/);
  assert.match(earlySeo, /\.scroller \{ overflow-x: auto/);
  assert.match(earlySeo, /<div class="scroller">/);
  // Money must not break mid-figure; the path label may wrap so the "Worth"
  // column stays visible on a laptop instead of scrolling out of view.
  assert.match(lateSeo, /td \{ white-space: nowrap; \} th, td:first-child \{ white-space: normal; \}/);
});

test('the result panel is announced to screen readers when it updates', () => {
  // The result section re-renders the due date, cash-flow figures, and
  // schedule/scenario tables in place on every keystroke, with no page
  // reload. Before this fix the only aria-live elements on the page were
  // status notes (#draftStatus, #status, #scheduleStatus) that render()
  // never writes the result figures into, so a screen-reader user changing
  // an input got no announcement that the readout had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: adjacent steps in one job. This tool produces the date cash
// lands; that one turns those dates into a shortfall forecast. Rotating chrome
// may never pair them inside the back-office subcategory.
test('index links one hop to the cash-runway-planner sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/cash\-runway\-planner\/"/,
    'index must link ../cash-runway-planner/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /cash runway planner/i);
});

// Closes the orphan pair with cash-flow-risk-forecaster: this tool sets the payment date, that one simulates it arriving late.
test('index links one hop to the cash-flow-risk-forecaster sibling', () => {
  const html = readIndexForSiblingCheck(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\.\.\/cash-flow-risk-forecaster\/"/, 'index must link ../cash-flow-risk-forecaster/ in one hop');
});
