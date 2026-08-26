import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEarlyPay, compareLateInvoice, earlyPayNote } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const earlySeo = readFileSync(new URL("./should-i-offer-2-10-net-30.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the calculator page wires due-date, late-fee, and 2/10 compare without a build step", () => {
  assert.match(html, /calculateTerms/);
  assert.match(html, /compareEarlyPay/);
  assert.match(html, /earlyPayNote/);
  assert.match(html, /id="earlyPayDays"/);
  assert.match(html, /id="earlyPayDiscountPct"/);
  assert.match(html, /id="annualCarryRate"/);
  assert.match(html, /id="takeRatePct"/);
  assert.match(html, /early_pay_compared/);
  assert.match(html, /should-i-offer-2-10-net-30\.html/);
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
