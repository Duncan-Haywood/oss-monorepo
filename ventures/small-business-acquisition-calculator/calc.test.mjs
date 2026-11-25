import { test } from "node:test";
import assert from "node:assert/strict";
import { annualPayment, balanceAfter, parseInputs, evaluate, sampleInputs, reportCsv, money, pct } from "./calc.mjs";

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("annualPayment matches the standard amortisation figure", () => {
  // $100,000 at 6% over 30 years is $599.55 a month
  near(annualPayment(100000, 6, 30) / 12, 599.55, 0.01);
  assert.equal(annualPayment(0, 6, 10), 0);
  near(annualPayment(120000, 0, 10), 12000, 0.001);
});

test("balanceAfter is the full loan at 0 months and zero at maturity", () => {
  near(balanceAfter(100000, 6, 10, 0), 100000, 0.001);
  assert.equal(balanceAfter(100000, 6, 10, 120), 0);
  assert.ok(balanceAfter(100000, 6, 10, 60) < 100000 && balanceAfter(100000, 6, 10, 60) > 50000);
});

test("parseInputs rejects non-numbers, out-of-range values and over-100% structures", () => {
  assert.match(parseInputs({ price: "abc" }).error, /Asking price/);
  assert.match(parseInputs({ downPct: -1 }).error, /down payment/i);
  assert.match(parseInputs({ downPct: 60, sellerPct: 50 }).error, /exceed 100%/);
  assert.match(parseInputs({ sbaRate: 99 }).error, /above/);
  assert.ok(parseInputs({}).values);
});

test("parseInputs accepts dollar signs and commas", () => {
  assert.equal(parseInputs({ price: "$1,500,000" }).values.price, 1500000);
});

test("the sample deal: loan sizes, DSCR and cash at close", () => {
  const r = evaluate(sampleInputs());
  near(r.bankLoan, 960000, 0.001);
  near(r.sellerNote, 120000, 0.001);
  near(r.bankDS, annualPayment(960000, 10.5, 10), 0.01);
  near(r.cashAtClose, 120000 + 48000, 0.001);
  near(r.cashTotal, 120000 + 48000 + 50000, 0.001);
  near(r.cfads, 360000 - 90000 - 15000, 0.001);
  near(r.dscr, r.cfads / (r.bankDS + r.sellerDS), 1e-9);
  near(r.multiple, 3.333, 0.001);
});

test("max price at the DSCR floor puts DSCR exactly on the floor", () => {
  const raw = sampleInputs();
  const r = evaluate(raw);
  const again = evaluate({ ...raw, price: r.maxPriceAtFloor });
  near(again.dscr, raw.targetDscr, 0.001);
});

test("a deal above the floor reports clears, a deal under 1.0 reports fails", () => {
  assert.equal(evaluate({ ...sampleInputs(), price: 800000 }).verdict, "clears");
  assert.equal(evaluate({ ...sampleInputs(), price: 2500000 }).verdict, "fails");
});

// Quality audit 2026-11-19: full standby means no P&I for the whole SBA term (SOP 50 10 8), so the note's payments
// must leave year-one cash as well as the DSCR. Sample: $71,716 shown before, $99,555 is right.
test("standby seller note drops out of DSCR and out of year-one cash", () => {
  const raw = sampleInputs();
  const a = evaluate(raw), b = evaluate({ ...raw, standby: true });
  assert.ok(b.dscr > a.dscr);
  near(b.dscr, b.cfads / b.bankDS, 1e-9);
  near(a.surplus, 71715.65, 0.05);
  near(b.surplus, 99555.35, 0.5);
  near(b.afterDebt - a.afterDebt, a.sellerDS, 0.001);
  near(b.sensitivity[0].cashAfter, b.surplus, 0.01);
  near(b.cashOnCash, b.surplus / b.cashTotal, 1e-9);
  near(b.yearOneDS, b.bankDS, 1e-9);
});

test("after standby the note's payment is on the balance accrued over the bank term", () => {
  const b = evaluate({ ...sampleInputs(), standby: true });
  // By hand: 120,000 x 1.005^120 = 218,327.2; 5-year 6% level payment = 4,220.88/month = 50,650.6/year.
  const accrued = 120000 * Math.pow(1.005, 120);
  near(accrued, 218327.2, 0.5);
  const monthly = (accrued * 0.005) / (1 - Math.pow(1.005, -60));
  near(monthly * 12, 50650.6, 1);
  near(b.sellerDSAfterStandby, monthly * 12, 0.01);
  assert.equal(evaluate(sampleInputs()).sellerDSAfterStandby, 0);
  assert.match(b.notes.join(" "), /costs about \$50,651 a year/);
});

test("SBA equity check: 10% of project cost, a standby note supplies at most half", () => {
  const sample = evaluate(sampleInputs());
  near(sample.projectCost, 1298000, 0.001);
  near(sample.equityRequired, 129800, 0.001);
  assert.equal(sample.equityShort, 0);
  // 5% cash + 10% seller note on a $1.2M price with no closing costs or working capital: needs $120,000.
  const base = { ...sampleInputs(), downPct: 5, closingPct: 0, workingCap: 0 };
  const onStandby = evaluate({ ...base, standby: true });
  near(onStandby.equityCounted, 60000 + 60000, 0.001); // the note counts only up to half of 120,000
  assert.equal(onStandby.equityShort, 0);
  assert.doesNotMatch(onStandby.notes.join(" "), /Equity injection is short/);
  const notStandby = evaluate(base);
  near(notStandby.equityShort, 60000, 0.001);
  assert.match(notStandby.notes.join(" "), /Equity injection is short by about \$60,000/);
  // 3% cash + 10% standby note: the note's credit is capped at 60,000, so 24,000 short.
  near(evaluate({ ...base, downPct: 3, standby: true }).equityShort, 120000 - 36000 - 60000, 0.001);
});

test("notes flag a DSCR floor under the SBA 1.25 minimum and a bank loan over the 7(a) maximum", () => {
  assert.match(evaluate({ ...sampleInputs(), targetDscr: 1.15 }).notes.join(" "), /sets 1.25 as the minimum/);
  assert.doesNotMatch(evaluate(sampleInputs()).notes.join(" "), /sets 1.25 as the minimum/);
  assert.match(evaluate({ ...sampleInputs(), price: 7000000, sde: 2500000 }).notes.join(" "), /maximum loan is \$5,000,000/);
  assert.doesNotMatch(evaluate(sampleInputs()).notes.join(" "), /maximum loan/);
});

test("all-cash structure has no debt and an infinite DSCR", () => {
  const r = evaluate({ ...sampleInputs(), downPct: 100, sellerPct: 0 });
  assert.equal(r.totalDS, 0);
  assert.equal(r.dscr, Infinity);
  assert.equal(r.maxPriceAtFloor, null);
});

test("break-even SDE is the SDE at which DSCR is 1.00", () => {
  const raw = sampleInputs();
  const r = evaluate(raw);
  near(evaluate({ ...raw, sde: r.breakEvenSde }).dscr, 1, 1e-6);
  assert.ok(r.breakEvenDropPct > 0);
});

test("sensitivity rows fall as SDE falls", () => {
  const r = evaluate(sampleInputs());
  assert.equal(r.sensitivity.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(r.sensitivity[i].dscr < r.sensitivity[i - 1].dscr);
});

test("notes flag a thin down payment, a high multiple and a salary the business cannot cover", () => {
  const r = evaluate({ ...sampleInputs(), downPct: 5, price: 2000000, closingPct: 0, workingCap: 0 });
  const text = r.notes.join(" ");
  assert.match(text, /Equity injection is short/);
  assert.match(text, /more than 4x SDE/);
  assert.match(text, /below your 1.25 floor/);
  assert.match(evaluate({ ...sampleInputs(), sde: 100000 }).notes.join(" "), /does not cover your salary/);
});

test("reportCsv quotes cells and carries the key figures", () => {
  const csv = reportCsv(evaluate(sampleInputs()));
  assert.match(csv, /"DSCR"/);
  assert.match(csv, /"Max price at DSCR floor"/);
  assert.equal(csv.split("\n")[0], '"item","value"');
});

test("money and pct format", () => {
  assert.equal(money(1234567.4), "$1,234,567");
  assert.equal(money(-1500), "-$1,500");
  assert.equal(pct(12.34), "12.3%");
});

// Quality audit 2026-11-19: two seeded bugs in shown numbers survived; these pin them.
test("sensitivity base row equals the headline surplus, and cash-on-cash divides surplus by cash in", () => {
  const r = evaluate(sampleInputs());
  assert.ok(Math.abs(r.sensitivity[0].cashAfter - r.surplus) < 0.01, `${r.sensitivity[0].cashAfter} vs ${r.surplus}`);
  assert.ok(Math.abs(r.surplus - 71715.65) < 0.05, String(r.surplus));
  assert.ok(Math.abs(r.cashOnCash - 71715.65 / 218000) < 1e-4, String(r.cashOnCash));
});

test("parseInputs rejects suffixes like 90k or 1.2M instead of reading 90 or 1.2", () => {
  assert.match(parseInputs({ salary: "90k" }).error, /Salary/i);
  assert.match(parseInputs({ price: "1.2M" }).error, /Asking price/);
  assert.equal(parseInputs({ price: "$1,200,000" }).values.price, 1200000);
});
