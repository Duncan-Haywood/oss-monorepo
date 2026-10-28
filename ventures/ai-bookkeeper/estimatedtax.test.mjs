import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { bracketTax, estimatedTax, taxTableOptions, toCents, BRACKETS } from "./estimatedtax.mjs";

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
  // head of household, to the dollar (profit $1 adds about 93 cents of AGI after half the SE tax, so these land 50 cents either side of the line)
  const hohStd = BRACKETS[2026].hoh.std, hohWarns = (taxableCents) => estimatedTax(books("1.00"), { year: 2026, filing: "hoh", otherIncome: taxableCents + hohStd }).warnings.some((w) => /above the QBI threshold/.test(w));
  assert.equal(hohWarns(20174957 - 100), false); // ~$201,749.50, under the line
  assert.equal(hohWarns(20174957), true); // ~$201,750.50, over the line but under $201,751
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

test("blank, non-numeric or negative inputs never poison the plan", () => {
  const b = books("100000.00"), ok = estimatedTax(b, { year: 2026, asOf: "2026-01-01" });
  const nan = estimatedTax(b, { year: 2026, asOf: "2026-01-01", priorYearTax: NaN });
  assert.deepEqual(nan.payments, ok.payments);
  assert.ok(nan.warnings.some((w) => /No prior-year tax/.test(w)));
  assert.deepEqual(estimatedTax(b, { year: 2026, asOf: "2026-01-01", paid: -1000000 }).payments, ok.payments);
  assert.deepEqual(estimatedTax(b, { year: 2026, asOf: "2026-01-01", withholding: -1000000 }).payments, ok.payments);
  assert.equal(estimatedTax(b, { year: 2026, asOf: "2026-01-01", priorYearTax: 500000, priorAgi: NaN }).safeHarbor.prior, 500000);
});

test("redteam 2026-10-26: guards for escaped mutants (asOf boundary, balance, effective rate, 8959 warning)", () => {
  const b = books("100000.00");
  // a payment due on the asOf date itself is still due
  const onDay = estimatedTax(b, { year: 2026, asOf: "2026-06-15" });
  assert.equal(onDay.payments.filter((p) => p.status === "due").length, 3);
  assert.equal(onDay.payments.find((p) => p.due === "2026-06-15").status, "due");
  // over-withholding leaves a balance of exactly zero, never a refund shown as owed
  assert.equal(estimatedTax(b, { year: 2026, asOf: "2026-01-01", withholding: 5000000000 }).balanceWithReturn, 0);
  // money already paid lowers the balance and the plan; it never adds to it
  const pd = estimatedTax(b, { year: 2026, asOf: "2026-01-01", paid: 100000, priorYearTax: 100000 });
  const planned = pd.payments.reduce((s, p) => s + p.cents, 0);
  assert.equal(pd.balanceWithReturn, pd.totalTax - 100000 - planned);
  // wages alone (no business profit) still give an effective rate over wages
  const w = estimatedTax(newBooks(), { year: 2026, wages: 30000000 });
  assert.equal(w.effectiveRate, w.totalTax / 30000000);
  assert.ok(w.effectiveRate > 0);
  // the 8959 warning prints the threshold in dollars
  const hi = estimatedTax(newBooks(), { year: 2026, wages: 30000000 });
  assert.ok(hi.warnings.some((x) => /earnings above 200000;/.test(x)));
});

test("a tax table file in dollars gives a 2027 estimate that ties out by hand (figures made up, not the IRS's)", () => {
  const t = taxTableOptions({ standardDeduction: 17000, brackets: [[13000, 0.10], [51000, 0.12], [null, 0.22]], qbiThreshold: 210000, wageBase: 192300, qbiMinimum: { floor: 400, threshold: 1000 } });
  assert.deepEqual(t.brackets.at(-1), [Infinity, 0.22]);
  assert.equal(t.standardDeduction, 1700000);
  const r = estimatedTax(books("100000.00", 2027), { year: 2027, ...t });
  assert.equal(r.standardDeduction, 1700000);
  assert.ok(!r.warnings.some((w) => /from memory|are indexed/.test(w)));
  const tax = bracketTax(r.taxable, t.brackets);
  assert.equal(r.incomeTax, tax);
  assert.ok(tax > 0 && r.taxable < 10000000);
});

test("qbiThreshold overrides the built-in limit", () => {
  const o = { year: 2026, wageBase: 18450000 };
  assert.ok(estimatedTax(books("300000.00"), o).warnings.some((w) => /QBI threshold/.test(w)));
  assert.ok(!estimatedTax(books("300000.00"), { ...o, qbiThreshold: 99999999 }).warnings.some((w) => /QBI threshold/.test(w)));
});

test("a bad tax table is refused with a plain message", () => {
  assert.throws(() => taxTableOptions(null), /JSON object/);
  assert.throws(() => taxTableOptions({ brackets: [[10000, 0.1], [null, 0.2]] }), /standardDeduction/);
  assert.throws(() => taxTableOptions({ standardDeduction: 1, brackets: [[10000, 0.1], [5000, 0.2], [null, 0.3]] }), /above the one before/);
  assert.throws(() => taxTableOptions({ standardDeduction: 1, brackets: [[10000, 0.1]] }), /null upper bound/);
  assert.throws(() => taxTableOptions({ standardDeduction: 1, brackets: [[null, 0.1], [null, 0.2]] }), /only the last/);
  assert.throws(() => taxTableOptions({ standardDeduction: -5 }), /0 or more/);
  assert.throws(() => taxTableOptions({ standardDeduction: 1, brackets: [[10000, 12], [null, 0.2]] }), /between 0 and 1/);
});

test("the CLI reads --tax-table for a year with no built-in table", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const d = mkdtempSync(join(tmpdir(), "tt-"));
  writeFileSync(join(d, "books.json"), JSON.stringify(books("50000.00", 2027)));
  writeFileSync(join(d, "t.json"), JSON.stringify({ standardDeduction: 17000, brackets: [[13000, 0.1], [null, 0.2]] }));
  const run = (...a) => spawnSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(d, "books.json"), "estimate", "--year", "2027", ...a], { encoding: "utf8" });
  assert.notEqual(run().status, 0);
  const ok = run("--tax-table", join(d, "t.json"), "--json");
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).standardDeduction, 1700000);
  writeFileSync(join(d, "bad.json"), "{\"brackets\": 3}");
  assert.notEqual(run("--tax-table", join(d, "bad.json")).status, 0);
});

test("self-employed health insurance and a retirement contribution come off AGI and the QBI base, by hand", () => {
  const base = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000, healthInsurance: 1200000, retirement: 500000 });
  assert.equal(r.se.tax, base.se.tax); // neither touches self-employment tax
  assert.equal(r.healthDeduction, 1200000);
  assert.equal(r.retirementDeduction, 500000);
  assert.equal(r.agi, base.agi - 1700000);
  assert.equal(r.qbiDeduction, Math.round(0.2 * (r.agi - 1610000)));
  assert.ok(r.totalTax < base.totalTax);
  assert.ok(r.warnings.some((w) => /subsidised/.test(w)));
});

test("the health deduction cannot exceed the profit left after the retirement deduction", () => {
  const r = estimatedTax(books("10000.00"), { year: 2026, wageBase: 18450000, healthInsurance: 2000000, retirement: 300000 });
  const left = 1000000 - r.se.deduction;
  assert.equal(r.retirementDeduction, 300000);
  assert.equal(r.healthDeduction, left - 300000);
  assert.ok(r.warnings.some((w) => /capped at the business profit/.test(w)));
  assert.equal(r.taxable, 0);
});

test("negative or blank adjustments are ignored", () => {
  const a = estimatedTax(books("50000.00"), { year: 2026 });
  const b = estimatedTax(books("50000.00"), { year: 2026, healthInsurance: -5, retirement: NaN });
  assert.equal(b.totalTax, a.totalTax);
});

test("child tax credit lowers income tax, never below zero, and the rest is refundable up to the cap", () => {
  const base = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000, children: 2, otherDependents: 1 });
  assert.equal(r.childCredit, 490000); // 2 x 2,200 + 500, all absorbed by income tax
  assert.equal(r.refundableCredit, 0);
  assert.equal(r.totalTax, base.totalTax - 490000);
  assert.ok(r.warnings.some((w) => /Schedule 8812/.test(w)));
  // Low profit: income tax is small, so the child part spills into the refundable credit.
  const low = estimatedTax(books("20000.00"), { year: 2026, wageBase: 18450000, children: 2 });
  assert.equal(low.childCredit, low.incomeTax);
  const earned = 2000000 - low.se.deduction;
  assert.equal(low.refundableCredit, Math.min(440000 - low.incomeTax, 340000, Math.round(0.15 * (earned - 250000))));
});

test("child tax credit phases out $50 per $1,000 over the threshold; no children changes nothing", () => {
  const none = estimatedTax(books("250000.00"), { year: 2026, wageBase: 18450000 });
  assert.equal(none.childCredit, 0);
  const r = estimatedTax(books("250000.00"), { year: 2026, wageBase: 18450000, children: 1 });
  const cut = Math.ceil((r.agi - 20000000) / 100000) * 5000;
  assert.equal(r.childCredit, 220000 - cut);
  const mfj = estimatedTax(books("250000.00"), { year: 2026, wageBase: 18450000, filing: "mfj", children: 1 });
  assert.equal(mfj.childCredit, 220000); // under $400,000 joint
});

test("above the QBI range a sole proprietor with no staff loses the deduction; business wages restore up to 50% of them", () => {
  const o = { year: 2026, wageBase: 18450000 };
  const top = estimatedTax(books("400000.00"), o); // taxable before QBI is far above 201,750 + 75,000
  assert.equal(top.qbiDeduction, 40000); // only the $400 minimum of IRC 199A(i) is left
  assert.ok(top.warnings.some((w) => /limited to 50% of the business's W-2 wages/.test(w)));
  const staffed = estimatedTax(books("400000.00"), { ...o, businessWages: 4000000 });
  assert.equal(staffed.qbiDeduction, 2000000); // 50% of 40,000 is under 20% of the profit
  assert.equal(staffed.taxable, top.taxable - (2000000 - 40000));
});

test("inside the phase-in the QBI deduction falls linearly; a service business loses it over the same range", () => {
  const o = { year: 2026, wageBase: 18450000 };
  const r = estimatedTax(books("250000.00"), o);
  const pct = (r.agi - r.standardDeduction - 20175000) / 7500000;
  assert.ok(pct > 0 && pct < 1);
  const q = 0.2 * (r.profit - r.se.deduction);
  assert.equal(r.qbiDeduction, Math.round(q - pct * q));
  const s = estimatedTax(books("250000.00"), { ...o, service: true });
  assert.equal(s.qbiDeduction, Math.round(q * (1 - pct) * (1 - pct))); // service: QBI shrinks by the share, then the wage limit phases in
  assert.ok(s.qbiDeduction < r.qbiDeduction);
  const sw = estimatedTax(books("250000.00"), { ...o, service: true, businessWages: 3000000 });
  assert.ok(sw.qbiDeduction < estimatedTax(books("250000.00"), { ...o, businessWages: 3000000 }).qbiDeduction);
  assert.equal(estimatedTax(books("250000.00"), { ...o, qbiRange: 100, qbiMinimum: { floor: 0, threshold: 1000 } }).qbiDeduction, 0);
});

test("itemised deductions replace the standard deduction only when larger", () => {
  const base = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  const small = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000, itemized: 1000000 });
  assert.equal(small.taxable, base.taxable);
  assert.equal(small.itemizing, false);
  const big = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000, itemized: 3000000 });
  assert.equal(big.itemizing, true);
  assert.equal(big.standardDeduction, 3000000);
  assert.ok(big.incomeTax < base.incomeTax);
});

test("net investment income tax: 3.8% of the smaller of the income and AGI over 200,000", () => {
  const o = { year: 2026, wageBase: 18450000, wages: 25000000, other: 0 };
  const none = estimatedTax(books("1000.00"), { ...o, otherIncome: 5000000 });
  assert.equal(none.niit, 0);
  const r = estimatedTax(books("1000.00"), { ...o, otherIncome: 5000000, investmentIncome: 5000000 });
  const over = r.agi - 20000000;
  assert.equal(r.niit, Math.round(0.038 * Math.min(5000000, over)));
  assert.equal(r.totalTax, none.totalTax + r.niit);
  // joint threshold is 250,000: AGI near 230,000 owes none
  const j = estimatedTax(books("1000.00"), { ...o, wages: 18000000, filing: "mfj", otherIncome: 5000000, investmentIncome: 5000000 });
  assert.equal(j.niit, 0);
});

test("age 65 and blindness add to the standard deduction; the senior deduction phases out at 6%", () => {
  const o = { year: 2026, wageBase: 18450000 };
  const base = estimatedTax(books("100000.00"), o);
  const one = estimatedTax(books("100000.00"), { ...o, over65: 1 });
  assert.equal(one.extraStandard, 205000);
  // 6,000 less 6% of (AGI - 75,000)
  assert.equal(one.seniorDeduction, Math.max(0, 600000 - Math.round(0.06 * (one.agi - 7500000))));
  assert.equal(base.taxable - one.taxable, one.extraStandard + one.seniorDeduction - (base.qbiDeduction - one.qbiDeduction));
  assert.equal(estimatedTax(books("100000.00"), { ...o, over65: 1, blind: 1 }).extraStandard, 410000);
  assert.equal(estimatedTax(books("100000.00"), { ...o, over65: 1, itemized: 5000000 }).extraStandard, 0);
  assert.ok(one.warnings.some((w) => /senior deduction/.test(w)));
  assert.equal(estimatedTax(books("100000.00"), { ...o, over65: NaN }).taxable, base.taxable);
});

test("earned income credit from a passed schedule: phase-in, plateau, phase-out, joint start, investment limit", () => {
  // Made-up schedule, not an IRS table.
  const { eitc } = taxTableOptions({ eitc: { rows: [{ rate: 0.1, earnedAmount: 10000, phaseOutRate: 0.1, phaseOutStart: 12000 }, { rate: 0.4, earnedAmount: 10000, phaseOutRate: 0.2, phaseOutStart: 20000 }], marriedAdd: 5000, investmentLimit: 10000 } });
  const o = { year: 2026, wageBase: 18450000, wages: 1000000, withholding: 0, eitc, eitcChildren: 1, qbi: false };
  const none = estimatedTax(books("1.00"), { ...o, eitc: undefined, eitcChildren: undefined });
  const mid = estimatedTax(books("1.00"), o);
  assert.equal(mid.eitcCredit, 400000);           // plateau: 0.4 x 10,000
  assert.equal(mid.totalTax, none.totalTax - 400000);
  const low = estimatedTax(books("1.00"), { ...o, wages: 500000 });
  assert.ok(Math.abs(low.eitcCredit - 200000) < 100);          // phase-in: 0.4 x 5,000
  const out = estimatedTax(books("1.00"), { ...o, wages: 2500000 });
  assert.ok(Math.abs(out.eitcCredit - 300000) < 100); // phase-out
  const joint = estimatedTax(books("1.00"), { ...o, wages: 2500000, filing: "mfj" });
  assert.ok(Math.abs(joint.eitcCredit - 400000) < 100);        // start moved up 5,000 by marriedAdd -> 25,000
  assert.equal(estimatedTax(books("1.00"), { ...o, otherIncome: 1500000, investmentIncome: 1500000 }).eitcCredit, 0);
  assert.ok(Math.abs(estimatedTax(books("1.00"), { ...o, eitcChildren: 0 }).eitcCredit - 100000) < 100); // 0.1 x 10,000
  assert.ok(mid.warnings.some((w) => /Earned income credit/.test(w)));
  assert.throws(() => taxTableOptions({ eitc: { rows: [] } }), /eitc/);
});

test("built-in 2025 earned income credit reproduces the IRS table", () => {
  // irs.gov EITC tables, tax year 2025: max credit 649/4,328/7,152/8,046; the credit ends at AGI
  // 19,104/50,434/57,310/61,555 (single) and 26,214/57,554/64,430/68,675 (joint).
  const max = [649, 4328, 7152, 8046], endS = [19104, 50434, 57310, 61555], endJ = [26214, 57554, 64430, 68675];
  const eic = (kids, filing, wages) => estimatedTax(books("1.00"), { year: 2025, wages: wages * 100, withholding: 0, eitcChildren: kids, filing, qbi: false }).eitcCredit / 100;
  [8490, 12730, 17880, 17880].forEach((e, k) => assert.ok(Math.abs(eic(k, "single", e) - max[k]) <= 1, `max credit, ${k} children`));
  for (let k = 0; k < 4; k++) {
    assert.equal(eic(k, "single", endS[k] + 100), 0);
    assert.equal(eic(k, "mfj", endJ[k] + 100), 0);
    assert.ok(eic(k, "single", endS[k] - 100) > 0 && eic(k, "single", endS[k] - 100) < 25);
    assert.ok(eic(k, "mfj", endJ[k] - 100) > 0 && eic(k, "mfj", endJ[k] - 100) < 25);
  }
  assert.equal(estimatedTax(books("1.00"), { year: 2025, wages: 1500000, eitcChildren: 1, investmentIncome: 1200000, qbi: false }).eitcCredit, 0); // over the investment limit
});

test("built-in 2026 earned income credit reproduces Rev. Proc. 2025-32", () => {
  const max = [664, 4427, 7316, 8231], endS = [19540, 51593, 58629, 62974], endJ = [26820, 58863, 65899, 70244];
  const eic = (kids, filing, wages) => estimatedTax(books("1.00"), { year: 2026, wages: wages * 100, withholding: 0, eitcChildren: kids, filing, qbi: false }).eitcCredit / 100;
  [8680, 13020, 18290, 18290].forEach((e, k) => assert.ok(Math.abs(eic(k, "single", e) - max[k]) <= 1, `max credit, ${k} children`));
  for (let k = 0; k < 4; k++) {
    assert.equal(eic(k, "single", endS[k] + 100), 0);
    assert.equal(eic(k, "mfj", endJ[k] + 100), 0);
    assert.ok(eic(k, "single", endS[k] - 100) > 0 && eic(k, "single", endS[k] - 100) < 25);
    assert.ok(eic(k, "mfj", endJ[k] - 100) > 0 && eic(k, "mfj", endJ[k] - 100) < 25);
  }
  assert.equal(estimatedTax(books("1.00"), { year: 2026, wages: 1500000, eitcChildren: 1, investmentIncome: 1250000, qbi: false }).eitcCredit, 0);
});

test("eitcTable computes the credit at the midpoint of Schedule EIC's $50 bands", () => {
  const eic = (wages, eitcTable) => estimatedTax(books("1.00"), { year: 2026, wages: wages * 100, withholding: 0, eitcChildren: 0, qbi: false, eitcTable }).eitcCredit;
  assert.ok(Math.abs(eic(5010, false) - 38327) < 10); // exact: 0.0765 x 5,010 = 383.27 (plus the $1 book's profit)
  assert.ok(Math.abs(eic(5010, true) - 38441) < 10); // band 5,000-5,050, midpoint 5,025 -> 384.41
  assert.equal(eic(5040, true), eic(5010, true));
  assert.equal(eic(9010, true), 66402);      // plateau unchanged
});

test("a flat state rate is applied to AGI less the state deduction and kept out of the federal total", () => {
  const b = books("1.00");
  const base = estimatedTax(b, { year: 2026, wages: 10000000, withholding: 0, qbi: false });
  const r = estimatedTax(b, { year: 2026, wages: 10000000, withholding: 0, qbi: false, stateRate: 0.05, stateDeduction: 500000, stateWithheld: 100000 });
  assert.equal(base.state, null);
  assert.equal(r.totalTax, base.totalTax);
  assert.equal(r.state.base, r.agi - 500000);
  assert.equal(r.state.tax, Math.round((r.agi - 500000) * 0.05));
  assert.equal(r.state.balance, r.state.tax - 100000);
  assert.equal(r.state.quarterly, Math.ceil(r.state.balance / 4));
  assert.throws(() => estimatedTax(b, { year: 2026, qbi: false, stateRate: 0.5 }), /stateRate/);
});
