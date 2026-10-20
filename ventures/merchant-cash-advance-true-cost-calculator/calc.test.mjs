import { test } from "node:test";
import assert from "node:assert/strict";
import { irr, annualise, analyzeMca, analyzeFactoring, termSensitivity, sampleMca, sampleFactoring, reportCsv, money, money2, pct } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("irr matches the annuity identity: funded = p * (1 - (1+r)^-n) / r", () => {
  const funded = 48500, p = 69000 / 168, n = 168;
  const r = irr([funded, ...Array(n).fill(-p)]);
  close(p * (1 - Math.pow(1 + r, -n)) / r, funded, 1e-4);
});

test("irr is zero when you repay exactly what you received, null when you repay less", () => {
  assert.equal(irr([1000, -500, -500]), 0);
  assert.equal(irr([1000, -400, -500]), null);
});

test("a one-period deal is the simple ratio: 1000 in, 1100 out is 10% per period", () => {
  close(irr([1000, -1100]), 0.1);
  close(annualise(0.1, 12).apr, 1.2);
  close(annualise(0.1, 12).ear, Math.pow(1.1, 12) - 1);
});

test("factor + term: payback, payment, funded and cost", () => {
  const r = analyzeMca(sampleMca());
  close(r.payback, 69000);
  close(r.payment, 69000 / 168);
  close(r.funded, 48500);
  close(r.cost, 20500);
  close(r.factor, 1.38);
  close(r.termYears, 168 / 252);
  assert.ok(r.apr > 1 && r.apr < 1.2, `apr ${r.apr}`);
  assert.ok(r.ear > r.apr);
});

test("payment + term back-solves the factor rate", () => {
  const r = analyzeMca({ frequency: "daily", advance: "10000", fees: "0", factor: "", payment: "100", n: "130", monthlyRevenue: "", altRate: "" });
  close(r.payback, 13000);
  close(r.factor, 1.3);
});

test("a disagreeing factor and payment schedule warns and uses the schedule", () => {
  const r = analyzeMca({ frequency: "weekly", advance: "10000", fees: "0", factor: "1.2", payment: "300", n: "52", monthlyRevenue: "", altRate: "" });
  close(r.payback, 15600);
  assert.ok(r.warnings.length === 1);
});

test("no fees and factor 1.00 costs nothing", () => {
  const r = analyzeMca({ advance: "1000", fees: "0", factor: "1", n: "10" });
  assert.equal(r.apr, 0);
  assert.equal(r.cost, 0);
});

test("fees raise the annualised cost at the same factor rate", () => {
  const a = analyzeMca({ advance: "50000", fees: "0", factor: "1.3", n: "150" });
  const b = analyzeMca({ advance: "50000", fees: "2500", factor: "1.3", n: "150" });
  assert.ok(b.apr > a.apr);
  close(b.cost - a.cost, 2500);
});

test("the same total repaid over a shorter term costs more per year", () => {
  const rows = termSensitivity(sampleMca());
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].apr < rows[i - 1].apr);
});

test("early payoff with no discount raises the annualised cost", () => {
  const r = analyzeMca(sampleMca());
  assert.ok(r.payoff[0].apr > r.payoff[1].apr && r.payoff[1].apr > r.payoff[3].apr);
  close(r.payoff[3].apr, r.apr, 1e-9);
  assert.ok(r.findings.some((f) => /early/.test(f.title)));
});

test("revenue share and alternative-loan comparison", () => {
  const r = analyzeMca(sampleMca());
  close(r.strain.monthlyPay, (69000 / 168 * 252) / 12);
  assert.ok(r.strain.share > 0.15 && r.findings.some((f) => /monthly revenue/.test(f.title)));
  assert.equal(r.alt.months, 8);
  assert.ok(r.alt.extra > 0);
  const zero = analyzeMca({ advance: "1000", fees: "0", factor: "1.1", n: "252", altRate: "0" });
  close(zero.alt.cost, 0);
});

test("invalid input returns an error, never NaN output", () => {
  for (const bad of [{ advance: "", n: "100", factor: "1.2" }, { advance: "1000", n: "0", factor: "1.2" }, { advance: "1000", n: "10", factor: "0.9" }, { advance: "1000", n: "10" }, { advance: "1000", fees: "1000", n: "10", factor: "1.2" }, { advance: "abc", n: "10", factor: "1.2" }]) {
    assert.ok(analyzeMca(bad).error, JSON.stringify(bad));
  }
});

test("factoring: started fee periods are billed in full", () => {
  const f = analyzeFactoring(sampleFactoring());
  assert.equal(f.periods, 2);
  close(f.discountFee, 1200);
  close(f.fees, 1250);
  close(f.advance, 18000);
  close(f.reserve, 2000);
  close(f.rebate, 750);
  close(f.cash, 18750);
  close(f.apr, (1250 / 18000) * (365 / 45));
  close(f.yearly.fees, 1250 * 24);
});

test("factoring: fees larger than the reserve are flagged", () => {
  const f = analyzeFactoring({ face: "1000", advancePct: "95", feePct: "5", feeDays: "30", days: "90", otherFees: "0" });
  assert.ok(f.rebate < 0);
  assert.ok(f.findings.some((x) => /exceed the reserve/.test(x.title)));
});

test("factoring input is validated", () => {
  for (const bad of [{ face: "", days: "30" }, { face: "1000", days: "0" }, { face: "1000", days: "30", advancePct: "120" }, { face: "1000", days: "30", feePct: "80" }]) {
    assert.ok(analyzeFactoring(bad).error, JSON.stringify(bad));
  }
});

test("csv output quotes fields and covers both modes", () => {
  assert.match(reportCsv(analyzeMca(sampleMca())), /"total_payback","69000.00"/);
  assert.match(reportCsv(analyzeFactoring(sampleFactoring())), /"billed_periods","2"/);
});

test("formatters", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money(null), "n/a");
  assert.equal(pct(0.5), "50.0%");
  assert.equal(pct(11.2), "1,120%");
});

test("money2 only signs negatives, not small positives or zero", () => {
  assert.equal(money2(0.5), "$0.50");
  assert.equal(money2(0), "$0.00");
  assert.equal(money2(-0.5), "-$0.50");
});

test("factoring fee period defaults to 30 days", () => {
  const r = analyzeFactoring({ face: "1000", advancePct: "90", feePct: "1", days: "31", otherFees: "0" });
  assert.equal(r.input.feeDays, 30);
  assert.equal(r.periods, 2);
});

test("fees exactly equal to the reserve is not flagged as exceeding it", () => {
  const r = analyzeFactoring({ face: "1000", advancePct: "90", feePct: "10", feeDays: "30", days: "30", otherFees: "0" });
  assert.equal(r.rebate, 0);
  assert.ok(!r.findings.some((f) => f.title === "Fees exceed the reserve"));
});
