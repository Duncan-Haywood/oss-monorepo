import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEarlyPay, earlyPayNote } from "./calc.mjs";

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
