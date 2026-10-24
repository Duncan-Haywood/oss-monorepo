import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { bracketTax, estimatedTax, toCents, BRACKETS } from "./estimatedtax.mjs";

const B26 = BRACKETS[2026].single.b;
function books(income, yr = 2026) {
  const { books: b } = importStatement(newBooks(), `Date,Description,Amount\n${yr}-03-01,CLIENT PAYMENT ACME,${income}\n`, "1000");
  return confirm(b, { [b.transactions[0].id]: "4000" });
}

test("bracket tax is hand-checkable", () => {
  // 10% of 12,400 = 1,240; 12% of (50,400-12,400) = 4,560; 22% of 9,600 = 2,112 at 60,000
  assert.equal(bracketTax(6000000, B26), 124000 + 456000 + 211200);
  assert.equal(bracketTax(0, B26), 0);
  assert.equal(bracketTax(100000, B26), 10000);
});

test("a $100,000 sole proprietor: SE tax, QBI, income tax and plan tie out by hand", () => {
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  // net earnings 92,350; SE tax 15.3% = 14,129.55 (12.4% of 92,350 = 11,451.40 + 2.9% = 2,678.15)
  assert.equal(r.se.tax, 1145140 + 267815);
  assert.equal(r.se.deduction, Math.round(r.se.tax / 2));
  assert.equal(r.agi, 10000000 - r.se.deduction);
  assert.equal(r.qbiDeduction, Math.round(0.2 * (r.agi - 1610000))); // the smaller of 20% of profit and 20% of taxable income
  assert.equal(r.taxable, r.agi - 1610000 - r.qbiDeduction);
  assert.equal(r.incomeTax, bracketTax(r.taxable, B26));
  assert.equal(r.totalTax, r.incomeTax + r.se.tax);
  assert.equal(r.payments.reduce((s, p) => s + p.cents, 0), r.safeHarbor.required);
  assert.equal(r.safeHarbor.required, r.safeHarbor.current90);
});

test("last year's tax lowers the plan when it is smaller (100%, or 110% over $150k AGI)", () => {
  const b = books("100000.00");
  const base = estimatedTax(b, { year: 2026 });
  const low = estimatedTax(b, { year: 2026, priorYearTax: 500000, priorAgi: 4000000 });
  assert.equal(low.safeHarbor.required, 500000);
  assert.ok(low.safeHarbor.required < base.safeHarbor.required);
  const hi = estimatedTax(b, { year: 2026, priorYearTax: 500000, priorAgi: 20000000 });
  assert.equal(hi.safeHarbor.required, 550000);
  assert.ok(low.warnings.every((w) => !/No prior-year/.test(w)));
});

test("withholding and payments already made reduce what is still due, over the dates left", () => {
  const b = books("100000.00");
  const r = estimatedTax(b, { year: 2026, asOf: "2026-06-16", paid: 200000, withholding: 100000 });
  assert.deepEqual(r.payments.map((p) => p.status), ["past", "past", "due", "due"]);
  assert.equal(r.payments[0].cents, 0);
  assert.equal(r.payments[2].cents + r.payments[3].cents, r.safeHarbor.required - 200000);
  assert.equal(r.safeHarbor.required, Math.round(r.totalTax * 0.9) - 100000);
});

test("a small bill after withholding needs no estimates; a loss pays nothing", () => {
  const small = estimatedTax(books("5000.00"), { year: 2026 });
  assert.ok(small.safeHarbor.exempt);
  assert.equal(small.payments.reduce((s, p) => s + p.cents, 0), 0);
  const loss = estimatedTax(books("-3000.00"), { year: 2026 });
  assert.equal(loss.totalTax, 0);
});

test("annualising a part year, W-2 wages in the base, and married filing jointly", () => {
  const b = books("50000.00");
  assert.equal(estimatedTax(b, { year: 2026, monthsElapsed: 6 }).profit, 10000000);
  const w = estimatedTax(b, { year: 2026, wages: 6000000, filing: "mfj" });
  assert.equal(w.agi, 5000000 - w.se.deduction + 6000000);
  assert.equal(w.standardDeduction, 3220000);
});

test("unknown year needs brackets, and unchecked tables carry a warning", () => {
  assert.throws(() => estimatedTax(books("1000.00"), { year: 2031 }), /No single brackets/);
  const r = estimatedTax(books("1000.00"), { year: 2031, brackets: [[Infinity, 0.1]], standardDeduction: 0 });
  assert.ok(r.incomeTax >= 0);
  assert.ok(estimatedTax(books("1000.00"), { year: 2025 }).warnings.some((w) => /match the IRS text of Rev. Proc. 2024-40/.test(w)));
  assert.ok(estimatedTax(books("1000.00"), { year: 2026 }).warnings.some((w) => /match the IRS text of Rev. Proc. 2025-32/.test(w)));
});

test("Additional Medicare Tax: 0.9% of earnings over $200,000, wages counting first", () => {
  // profit 300,000: net earnings 277,050; over 200,000 by 77,050 -> 693.45
  const a = estimatedTax(books("300000.00"), { year: 2026, wageBase: 18450000 });
  assert.equal(a.addlMedicare, Math.round(0.009 * 7705000));
  assert.equal(a.totalTax, a.incomeTax + a.se.tax + a.addlMedicare);
  // 150,000 of wages lowers the SE threshold to 50,000: 0.9% of (277,050 - 50,000) = 2,043.45
  const w = estimatedTax(books("300000.00"), { year: 2026, wageBase: 18450000, wages: 15000000 });
  assert.equal(w.addlMedicare, Math.round(0.009 * (27705000 - 5000000)));
  // married filing jointly has a $250,000 threshold
  const m = estimatedTax(books("300000.00"), { year: 2026, filing: "mfj", wageBase: 18450000 });
  assert.equal(m.addlMedicare, Math.round(0.009 * (27705000 - 25000000)));
  // under the threshold there is none
  assert.equal(estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 }).addlMedicare, 0);
});

test("bracket tables are pinned to the published thresholds, and MFJ doubles single where the law says so", () => {
  const edges = (y, f) => BRACKETS[y][f].b.slice(0, -1).map(([hi]) => hi / 100);
  assert.deepEqual(edges(2025, "single"), [11925, 48475, 103350, 197300, 250525, 626350]);
  assert.deepEqual(edges(2025, "mfj"), [23850, 96950, 206700, 394600, 501050, 751600]);
  assert.deepEqual(edges(2025, "hoh"), [17000, 64850, 103350, 197300, 250500, 626350]);
  assert.deepEqual(edges(2026, "single"), [12400, 50400, 105700, 201775, 256225, 640600]);
  assert.deepEqual(edges(2026, "mfj"), [24800, 100800, 211400, 403550, 512450, 768700]);
  assert.deepEqual(edges(2026, "hoh"), [17700, 67450, 105700, 201750, 256200, 640600]);
  for (const y of [2025, 2026]) for (let i = 0; i < 4; i++) assert.equal(edges(y, "mfj")[i], 2 * edges(y, "single")[i]);
});

test("the QBI-threshold warning needs a QBI deduction and income above the limit", () => {
  const re = /above the QBI threshold/;
  const hi = estimatedTax(books("400000.00"), { year: 2026 });
  assert.ok(hi.warnings.some((w) => re.test(w)));
  assert.ok(estimatedTax(books("400000.00"), { year: 2026, qbi: false }).warnings.every((w) => !re.test(w)));
  assert.ok(estimatedTax(books("50000.00"), { year: 2026 }).warnings.every((w) => !re.test(w)));
});

test("the 2026 QBI threshold is Rev. Proc. 2025-32's $201,750 (single) and $403,500 (joint), not 2025's", () => {
  const re = /above the QBI threshold/, warns = (o) => estimatedTax(books("1.00"), { year: 2026, ...o }).warnings.some((w) => re.test(w));
  // taxable before QBI = other income - standard deduction (profit is ~$1)
  assert.equal(warns({ otherIncome: 21600000 }), false); // ~$199,900 taxable, over 2025's $197,300 line only
  assert.equal(warns({ otherIncome: 21800000 }), true); // ~$201,900
  assert.equal(warns({ filing: "mfj", otherIncome: 43000000 }), false); // ~$397,800, over 2025's $394,600
  assert.equal(warns({ filing: "mfj", otherIncome: 44000000 }), true);
});

test("what the plan does not cover is left as the balance due with the return", () => {
  const r = estimatedTax(books("100000.00"), { year: 2026, withholding: 100000, paid: 0 });
  const planned = r.payments.reduce((s, p) => s + p.cents, 0);
  assert.ok(r.balanceWithReturn > 0);
  assert.equal(r.balanceWithReturn, r.totalTax - 100000 - planned);
});

test("2026 minimum QBI deduction: $400 once QBI reaches $1,000, only where 20% is smaller", () => {
  const q = (profit, o = {}) => estimatedTax(books(profit), { year: 2026, otherIncome: 5000000, ...o }).qbiDeduction;
  assert.equal(q("1100.00"), 40000); // QBI about $1,000.7 -> 20% is $200, floor $400
  assert.ok(q("900.00") < 40000);
  assert.equal(q("1100.00", { qbi: false }), 0);
  assert.equal(estimatedTax(books("1100.00"), { year: 2025, otherIncome: 5000000 }).qbiDeduction < 40000, true);
  assert.equal(q("10000.00") > 40000, true); // above the floor, 20% rules
});

test("the minimum QBI deduction warns about material participation, and about indexing from 2027", () => {
  const w = (profit, year) => estimatedTax(books(profit, year), { year, otherIncome: 5000000, brackets: BRACKETS[2026].single.b, standardDeduction: 0 }).warnings;
  assert.ok(w("1100.00", 2026).some((x) => /materially participate/.test(x)));
  assert.ok(w("10000.00", 2026).every((x) => !/materially participate/.test(x)));
  assert.ok(!w("1100.00", 2026).some((x) => /indexed/.test(x)));
  assert.ok(w("1100.00", 2027).some((x) => /indexed/.test(x)));
});

test("2025 standard deductions are the post-2025-law figures and the QBI thresholds Rev. Proc. 2024-40's", () => {
  // Rev. Proc. 2024-40 .15 said 15,000 / 30,000 / 22,500; the 2025 law raised them (IRS 2026 inflation release, Form 1040 instructions).
  assert.deepEqual([BRACKETS[2025].single.std, BRACKETS[2025].mfj.std, BRACKETS[2025].hoh.std], [1575000, 3150000, 2362500]);
});

test("toCents turns dollar strings into whole cents", () => {
  assert.equal(toCents("12.34"), 1234);
  assert.equal(toCents(0), 0);
  assert.equal(toCents("1000"), 100000);
});

test("effective rate is a share of income and is 0 with no income", () => {
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  assert.equal(r.effectiveRate, r.totalTax / 10000000);
  const none = estimatedTax(newBooks(), { year: 2026, wageBase: 18450000 });
  assert.equal(none.effectiveRate, 0);
});

test("a blank (NaN) wages, withholding or paid field counts as zero, not NaN payments", () => {
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000, wages: NaN, otherIncome: NaN, withholding: NaN, paid: NaN });
  const base = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  assert.equal(r.totalTax, base.totalTax);
  assert.deepEqual(r.payments.map((p) => p.cents), base.payments.map((p) => p.cents));
  assert.ok(Number.isFinite(r.balanceWithReturn));
});

test("minimum QBI deduction: exactly $1,000 qualifies (\"at least\", 199A(i)(2)); later years take indexed amounts and warn", () => {
  const { books: b0 } = importStatement(newBooks(), "Date,Description,Amount\n2027-03-01,CLIENT PAYMENT ACME,1100.00\n", "1000");
  const b = confirm(b0, { [b0.transactions[0].id]: "4000" });
  const base = { year: 2027, brackets: BRACKETS[2026].single.b, standardDeduction: 1610000, otherIncome: 5000000 };
  const r = estimatedTax(b, base);
  assert.ok(r.warnings.some((w) => /indexed for 2027/.test(w)));
  const i = estimatedTax(b, { ...base, qbiMinimum: { floor: 41000, threshold: 100000 } });
  assert.equal(i.qbiDeduction, 41000);
  assert.ok(i.warnings.every((w) => !/indexed for 2027/.test(w)));
  assert.ok(estimatedTax(b, { ...base, qbiMinimum: { floor: 41000, threshold: 120000 } }).qbiDeduction < 41000);
});
