import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, evaluate, parseOffer, parseTax, rateToMatch, sampleInput, reportCsv, money, FICA } from "./calc.mjs";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const TAX = { rate: 0.2, taxHome: true };
const base = { name: "X", rate: "30", hours: "36", weeks: "13", guaranteed: "yes" };

test("hand-calculated week: taxable wages, stipends, tax and costs", () => {
  const o = parseOffer({ ...base, housing: "1000", mie: "400", housingCost: "900", premium: "50" }, "A");
  const r = evaluate(o, TAX);
  close(r.weekTaxable, 30 * 36);          // 1080
  close(r.weekStipend, 1400);
  close(r.grossWeekly, 2480);
  close(r.gross, 13 * 2480);              // 32240
  close(r.taxes, 13 * 1080 * (0.2 + FICA)); // 3893.5 (tax on wages only)
  close(r.costs, 13 * (50 + 900));        // 12350
  close(r.net, 32240 - 13 * 1080 * 0.2765 - 12350);
  close(r.netPerWeekAll, r.net / 13);
});

test("no tax home: stipends and travel reimbursement are taxed like wages", () => {
  const o = parseOffer({ ...base, housing: "1000", mie: "400", travel: "600" }, "A");
  const yes = evaluate(o, { rate: 0.2, taxHome: true });
  const no = evaluate(o, { rate: 0.2, taxHome: false });
  close(yes.net - no.net, (13 * 1400 + 600) * (0.2 + FICA));
});

test("bonus is always taxed", () => {
  const o = parseOffer({ ...base, bonus: "2000" }, "A");
  const a = evaluate(o, TAX), b = evaluate({ ...o, bonus: 0 }, TAX);
  close(a.net - b.net, 2000 * (1 - 0.2 - FICA));
});

test("overtime is paid at the multiplier on the taxable rate only", () => {
  const o = parseOffer({ ...base, otHours: "10", otMult: "1.5" }, "A");
  close(evaluate(o, TAX).weekTaxable, 30 * 36 + 30 * 1.5 * 10);
});

test("cancellations cost nothing with a guarantee and cut taxable pay without one", () => {
  const g = parseOffer({ ...base, cancel: "20", guaranteed: "yes" }, "A");
  const n = parseOffer({ ...base, cancel: "20", guaranteed: "no" }, "A");
  close(evaluate(g, TAX).weekTaxable, 1080);
  close(evaluate(n, TAX).weekTaxable, 1080 * 0.8);
});

test("stipends are cut too only when proration is on and hours are not guaranteed", () => {
  const raw = { ...base, guaranteed: "no", cancel: "50", housing: "1000" };
  close(evaluate(parseOffer({ ...raw, prorate: "no" }, "A"), TAX).weekStipend, 1000);
  close(evaluate(parseOffer({ ...raw, prorate: "yes" }, "A"), TAX).weekStipend, 500);
  close(evaluate(parseOffer({ ...raw, guaranteed: "yes", prorate: "yes" }, "A"), TAX).weekStipend, 1000);
});

test("gap weeks dilute the weekly average but not the contract take-home", () => {
  const o = parseOffer({ ...base, gap: "3" }, "A");
  const r = evaluate(o, TAX);
  close(r.span, 16);
  close(r.netPerWeekAll, r.net / 16);
  close(r.netPerYear, (r.net / 16) * 52);
  assert.ok(r.netPerWeekWorking > r.netPerWeekAll);
});

test("rateToMatch returns the rate at which two offers tie, exactly", () => {
  const cheap = parseOffer({ ...base, rate: "20", housing: "500" }, "A");
  const rich = parseOffer({ ...base, rate: "45", housing: "500", gap: "1" }, "B");
  const target = evaluate(rich, TAX).netPerWeekAll;
  const need = rateToMatch(cheap, TAX, target);
  close(evaluate({ ...cheap, rate: need }, TAX).netPerWeekAll, target, 1e-6);
  assert.ok(need > 20);
});

test("analyze picks the offer that keeps the most, not the biggest gross", () => {
  const a = analyze({
    taxRate: "20", taxHome: "no",
    offers: [
      { ...base, name: "Stipend", rate: "20", housing: "1600", mie: "600", housingCost: "1200", premium: "80", gap: "8" },
      { ...base, name: "Wage", rate: "70", housingCost: "1200", premium: "80" },
    ],
  });
  assert.equal(a.offers[a.best].label, "Wage");
  assert.ok(a.results[0].grossWeekly > a.results[1].grossWeekly);
  assert.ok(a.findings.some((f) => /biggest weekly gross/.test(f.title)));
});

test("tax home flips which offer wins in the sample", () => {
  const x = sampleInput();
  const yes = analyze({ ...x, taxHome: "yes" });
  const no = analyze({ ...x, taxHome: "no" });
  assert.notEqual(yes.results[0].net, no.results[0].net);
  assert.ok(no.results[0].net < yes.results[0].net);
});

test("sensitivity rows are flat with a guarantee and fall without one", () => {
  const a = analyze(sampleInput());
  assert.equal(a.sensitivity[0].length, 4);
  assert.ok(a.sensitivity[0].every((v) => Math.abs(v - a.sensitivity[0][0]) < 1e-9));
  assert.ok(a.sensitivity[1][3] < a.sensitivity[1][0]);
});

test("per-diem ceiling flags a housing stipend above 7 x the daily rate", () => {
  const a = analyze({ taxRate: "20", taxHome: "yes", offers: [{ ...base, housing: "1200", gsaLodging: "150" }, { ...base, rate: "31" }] });
  assert.ok(a.findings.some((f) => /above the per-diem ceiling/.test(f.title)));
  const b = analyze({ taxRate: "20", taxHome: "yes", offers: [{ ...base, housing: "1000", gsaLodging: "150" }, { ...base, rate: "31" }] });
  assert.ok(!b.findings.some((f) => /per-diem ceiling/.test(f.title)));
});

test("validation errors name the offer and the field", () => {
  assert.match(analyze({ taxRate: "20", offers: [{ ...base, rate: "" }] }).error, /Offer A.*taxable hourly rate/);
  assert.match(analyze({ taxRate: "20", offers: [base, { ...base, weeks: "0" }] }).error, /Offer B.*weeks/);
  assert.match(analyze({ taxRate: "99", offers: [base] }).error, /tax rate/);
  assert.match(analyze({ taxRate: "20", offers: [{ ...base, cancel: "150" }] }).error, /cancelled/);
  assert.match(analyze({ taxRate: "20", offers: [] }).error, /at least one/);
  assert.match(parseTax({ taxRate: "abc" }).error, /tax rate/);
});

test("money formatting and CSV", () => {
  assert.equal(money(1234567.4), "1,234,567");
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /^Offer,Weekly gross/);
  assert.match(csv, /"Agency A: stipend heavy"/);
  assert.equal(csv.trim().split("\n").length, 1 + 3 + 1 + 1 + 3);
});

test("at most three offers are read", () => {
  const o = { ...base };
  assert.equal(analyze({ taxRate: "20", offers: [o, o, o, o] }).offers.length, 3);
});
