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

test("standby seller note drops out of DSCR but not out of cash flow", () => {
  const raw = sampleInputs();
  const a = evaluate(raw), b = evaluate({ ...raw, standby: true });
  assert.ok(b.dscr > a.dscr);
  near(b.dscr, b.cfads / b.bankDS, 1e-9);
  near(b.afterDebt, a.afterDebt, 0.001);
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
  const r = evaluate({ ...sampleInputs(), downPct: 5, price: 2000000 });
  const text = r.notes.join(" ");
  assert.match(text, /under 10%/);
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
