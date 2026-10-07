import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCents, formatMoney, expenseSummary, invoiceIncome, form1099Clients, mileageSummary, selfEmploymentTax,
  incomeTaxOn, marginalRate, estimate, quarterlyPlan, checks, packCsv, readBox,
} from "./calc.mjs";

const inv = (o) => ({ issued: "2026-03-01", sent: true, lines: [{ qty: 1, rate: "1000" }], paid: "0", ...o });

test("money parsing is whole cents", () => {
  assert.equal(toCents("$1,234.567"), 123457);
  assert.equal(toCents(""), 0);
  assert.equal(formatMoney(123456), "$1,234.56");
});

test("expenses: meals 50%, business use scales, personal is excluded, lines sorted", () => {
  const box = { entries: [
    { date: "2026-02-01", cents: 10000, category: "meals" },
    { date: "2026-02-02", cents: 20000, category: "utilities", bizPct: 50 },
    { date: "2026-02-03", cents: 99900, category: "personal" },
    { date: "2025-12-31", cents: 5000, category: "office" },
    { date: "2026-03-01", cents: 8000, category: "supplies" },
  ] };
  const s = expenseSummary(box, 2026);
  assert.equal(s.deductible, 5000 + 10000 + 8000);
  assert.deepEqual(s.rows.map((r) => r.line), ["22", "24b", "25"]);
  assert.equal(s.missingReceipts, 3); // meals $100, utilities $200, supplies $80
  assert.equal(s.count, 4 - 1);
});

test("invoice income: paid share excludes sales tax, by client, unpaid tracked", () => {
  const box = { invoices: [
    inv({ clientName: "Acme", paid: "1080", taxRate: "8" }),
    inv({ clientName: "Acme", lines: [{ qty: 2, rate: "500" }], paid: "500" }),
    inv({ clientName: "Beta", paid: "0" }),
    inv({ clientName: "Void", void: true, paid: "1000" }),
    inv({ clientName: "Old", issued: "2025-05-01", paid: "1000" }),
  ] };
  const r = invoiceIncome(box, 2026, "paid");
  assert.equal(r.cents, 100000 + 50000);
  assert.equal(r.clients[0].client, "Acme");
  assert.equal(r.clients[0].invoices, 2);
  assert.equal(r.unpaid, 50000 + 100000);
  const sent = invoiceIncome(box, 2026, "invoiced");
  assert.equal(sent.cents, 100000 + 100000 + 100000);
});

test("unpaid on sent invoices excludes drafts", () => {
  const r = invoiceIncome({ invoices: [inv({ sent: false, clientName: "D" }), inv({ clientName: "S" })] }, 2026);
  assert.equal(r.unpaid, 100000);
});

test("1099 list uses the $2,000 threshold and skips unnamed clients", () => {
  const list = form1099Clients([{ client: "A", cents: 200000 }, { client: "B", cents: 199999 }, { client: "(no client name)", cents: 900000 }]);
  assert.deepEqual(list.map((c) => c.client), ["A"]);
});

test("mileage: business trips only, rate by date, odometer wins over typed miles", () => {
  const box = { trips: [
    { date: "2026-03-01", category: "business", miles: 100, to: "x", purpose: "y" },
    { date: "2026-08-01", category: "business", odoStart: 1000, odoEnd: 1100, miles: 5, to: "x", purpose: "y" },
    { date: "2026-08-02", category: "personal", miles: 500 },
    { date: "2026-08-03", category: "business", miles: 10, to: "", purpose: "" },
  ] };
  const m = mileageSummary(box, 2026);
  assert.equal(m.trips, 3);
  assert.equal(m.miles, 210);
  assert.equal(m.cents, 7250 + 7600 + 760);
  assert.equal(m.thin, 1);
  assert.equal(mileageSummary(box, 2026, 0.5).cents, 10500);
});

test("SE tax: 92.35% of profit, 15.3%, half deductible, below $400 is zero, wage base caps SS", () => {
  const s = selfEmploymentTax(10000000);
  assert.equal(s.earnings, 9235000);
  assert.equal(s.total, Math.round(9235000 * 0.153));
  assert.equal(s.half, Math.floor(s.total / 2));
  assert.equal(selfEmploymentTax(40000).total, 0);
  const big = selfEmploymentTax(30000000);
  assert.equal(big.ss, Math.round(18450000 * 0.124));
  const withW2 = selfEmploymentTax(10000000, 18450000);
  assert.equal(withW2.ss, 0);
});

test("income tax brackets: single and joint", () => {
  assert.equal(incomeTaxOn(1240000, "single"), 124000);
  assert.equal(incomeTaxOn(5040000, "single"), 124000 + Math.round((50400 - 12400) * 0.12 * 100));
  assert.equal(incomeTaxOn(0, "mfj"), 0);
  assert.equal(marginalRate(6000000, "single"), 0.22);
  assert.equal(marginalRate(6000000, "mfj"), 0.12);
});

test("estimate: net profit, QBI below threshold, SE half deducted from AGI", () => {
  const e = estimate({ grossIncome: 10000000, expenses: 2000000, mileage: 0, status: "single" });
  assert.equal(e.netProfit, 8000000);
  assert.equal(e.agi, 8000000 - e.se.half);
  const before = e.agi - 1610000;
  assert.equal(e.qbiDeduction, Math.round(0.2 * Math.min(8000000 - e.se.half, before)));
  assert.equal(e.taxable, before - e.qbiDeduction);
  assert.equal(e.totalTax, e.incomeTax + e.se.total);
  assert.equal(estimate({ grossIncome: 10000000, expenses: 2000000, qbi: false }).qbiDeduction, 0);
});

test("estimate: loss produces no SE tax and no negative tax", () => {
  const e = estimate({ grossIncome: 100000, expenses: 500000 });
  assert.equal(e.netProfit, -400000);
  assert.equal(e.se.total, 0);
  assert.equal(e.totalTax, 0);
});

test("estimate: QBI is withheld above the threshold with a note", () => {
  const e = estimate({ grossIncome: 40000000, expenses: 0 });
  assert.equal(e.qbiDeduction, 0);
  assert.match(e.qbiNote, /ask a preparer/);
});

test("quarterly plan: 90% rule, prior-year safe harbor, payments made, 110% over $150k AGI", () => {
  const a = quarterlyPlan({ totalTax: 1000000 });
  assert.equal(a.target, 900000);
  assert.equal(a.rows[0].target, 225000);
  const b = quarterlyPlan({ totalTax: 1000000, priorYearTax: 400000, priorYearAgi: 5000000 });
  assert.equal(b.target, 400000);
  assert.equal(b.basis, "prior-year safe harbor");
  const c = quarterlyPlan({ totalTax: 1000000, priorYearTax: 400000, priorYearAgi: 20000000 });
  assert.equal(c.target, 440000);
  const d = quarterlyPlan({ totalTax: 1000000, paid: [300000, 0, 0, 0] });
  assert.equal(d.rows[0].due_now, 0);
  assert.equal(d.rows[0].over, 75000);
  assert.equal(d.behind, 600000);
  assert.equal(quarterlyPlan({ totalTax: 90000 }).notRequired, true);
});

test("checks name the real problems and the double-vehicle claim", () => {
  const exp = expenseSummary({ entries: [{ date: "2026-01-01", cents: 50000, category: "car_truck" }] }, 2026);
  const mil = mileageSummary({ trips: [{ date: "2026-01-02", category: "business", miles: 10 }] }, 2026);
  const inc = invoiceIncome({ invoices: [inv({ clientName: "A" })] }, 2026);
  const out = checks({ income: inc, expenses: exp, mileage: mil, exp: {}, mil: {}, inv: {} }).map((c) => c.text).join(" | ");
  assert.match(out, /unpaid/);
  assert.match(out, /both actual car costs/);
  assert.match(out, /missing a destination or purpose/);
  assert.match(out, /receipt/);
});

test("CSV export neutralises formulas and quotes commas", () => {
  assert.equal(packCsv([["=cmd()", "a,b", "ok"]]), `'=cmd(),"a,b",ok\n`);
});

test("readBox tolerates garbage", () => {
  assert.equal(readBox("not json", "entries"), null);
  assert.equal(readBox(null, "entries"), null);
  assert.deepEqual(readBox('{"entries":[]}', "entries"), { entries: [] });
});
