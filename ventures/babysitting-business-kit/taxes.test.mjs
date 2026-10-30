import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";
import * as T from "./taxes.mjs";

// A desk with `income` paid on one date, plus optional expenses and tax inputs.
function desk({ income = 20000, date = "2026-06-01", expenses = [], miles = 0, taxes } = {}) {
  const d = E.emptyDesk();
  d.families = [{ id: "f1", name: "Test family" }];
  d.bookings = [{ id: "b1", familyId: "f1", date, start: "09:00", end: "17:00", kids: 1, status: "done", miles, payments: [{ amount: income, date, method: "cash" }] }];
  d.expenses = expenses;
  if (taxes) d.profile.taxes = taxes;
  return d;
}
const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("bracketTax walks the 2026 single brackets", () => {
  const b = T.BRACKETS[2026].single.b;
  assert.equal(T.bracketTax(0, b), 0);
  assert.equal(T.bracketTax(12400, b), 1240);
  near(T.bracketTax(50400, b), 1240 + 38000 * 0.12);
  near(T.bracketTax(60000, b), 1240 + 4560 + 9600 * 0.22);
});

test("seTax: 92.35%, 15.3%, nothing under $400 of net earnings, wages use up the wage base", () => {
  const s = T.seTax(20000, 2026);
  near(s.netEarnings, 18470);
  near(s.tax, 2825.91);
  near(s.deduction, 1412.96);
  assert.equal(T.seTax(430, 2026).tax, 0); // 430 x 0.9235 = 397.11
  const capped = T.seTax(20000, 2026, 184500);
  assert.equal(capped.socialSecurity, 0);
  near(capped.tax, 535.63);
});

test("federalEstimate: $20,000 profit, single, full year", () => {
  const e = T.federalEstimate(desk(), 2026, { today: "2027-02-01" });
  assert.equal(e.projected, false);
  near(e.profit, 20000);
  near(e.agi, 18587.04);
  assert.equal(e.standardDeduction, 16100);
  near(e.qbi, 497.41); // 20% of taxable income before QBI is smaller than 20% of QBI
  near(e.taxable, 1989.63);
  near(e.incomeTax, 198.96);
  near(e.total, 3024.87);
  // the real estimate sits well under the conservative set-aside
  assert.ok(e.setAside > e.total, `${e.setAside} > ${e.total}`);
});

test("federalEstimate: filing status, wages, withholding and the QBI minimum", () => {
  const base = { today: "2027-02-01" };
  const d = desk({ income: 30000 });
  const single = T.federalEstimate(d, 2026, { ...base, filing: "single", wages: 25000, withholding: 1500 });
  const hoh = T.federalEstimate(d, 2026, { ...base, filing: "hoh", wages: 25000, withholding: 1500 });
  const mfj = T.federalEstimate(d, 2026, { ...base, filing: "mfj", wages: 25000, spouseWages: 40000, withholding: 1500 });
  assert.ok(hoh.incomeTax < single.incomeTax);
  assert.equal(mfj.standardDeduction, 32200);
  near(mfj.agi, single.agi + 40000);
  near(single.balance, single.total - 1500);
  // spouse wages are ignored unless filing jointly
  near(T.federalEstimate(d, 2026, { ...base, filing: "single", spouseWages: 40000 }).agi, T.federalEstimate(d, 2026, base).agi);
  // $2,000 profit with $15,000 wages: 20% of QBI would be $371.74, the 2026 minimum lifts it to $400
  const small = T.federalEstimate(desk({ income: 2000 }), 2026, { ...base, wages: 15000 });
  assert.equal(small.qbi, 400);
});

test("federalEstimate projects the year so far, and reads saved inputs from the profile", () => {
  const d = desk({ income: 10000, date: "2026-03-01", taxes: { filing: "mfj", years: { 2026: { wages: 5000 } } } });
  const e = T.federalEstimate(d, 2026, { today: "2026-07-02" });
  assert.equal(e.projected, true);
  assert.equal(e.filing, "mfj");
  assert.equal(e.wages, 5000);
  near(e.profit, 10000 / (183 / 365), 1);
  assert.equal(T.federalEstimate(d, 2026, { today: "2026-07-02", project: false }).profit, 10000);
  assert.equal(T.yearFraction(2026, "2026-01-03"), 1 / 12);
});

test("above the QBI threshold the deduction is left out and a warning says so", () => {
  const e = T.federalEstimate(desk({ income: 300000 }), 2026, { today: "2027-01-01" });
  assert.equal(e.qbi, 0);
  assert.ok(e.addlMedicare > 0);
  assert.ok(e.warnings.some((w) => /QBI threshold/.test(w)));
});

test("safeHarbor: prior-year 100% beats 90% of this year, quarters need 25% each", () => {
  const d = desk({ taxes: { years: { 2026: { priorYearTax: 2000, priorAgi: 30000 } } } });
  const sh = T.safeHarbor(d, 2026, { today: "2026-01-02", project: false });
  near(sh.current90, 2722.38);
  assert.equal(sh.prior, 2000);
  assert.equal(sh.required, 2000);
  assert.match(sh.basis, /100% of last year/);
  assert.deepEqual(sh.quarters.map((q) => q.toPay), [500, 500, 500, 500]);
  assert.deepEqual(sh.quarters.map((q) => q.due), ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
});

test("safeHarbor: 110% above $150,000 AGI, payments made and a missed quarter roll forward", () => {
  const d = desk({ income: 60000, taxes: { years: { 2026: { priorYearTax: 4000, priorAgi: 160000 } }, payments: [{ id: "p1", year: 2026, date: "2026-04-10", amount: 1100 }, { id: "p2", year: 2025, date: "2026-01-10", amount: 999 }] } });
  const sh = T.safeHarbor(d, 2026, { today: "2026-07-01", project: false });
  assert.equal(sh.prior, 4400);
  assert.equal(sh.required, 4400);
  assert.equal(sh.paid, 1100); // the 2025 payment does not count toward 2026
  assert.equal(sh.quarters[0].shortfall, 0);
  assert.equal(sh.quarters[1].shortfall, 1100); // June 15 has passed with $2,200 needed, $1,100 paid
  assert.equal(sh.quarters[2].toPay, 2200);
  assert.equal(sh.quarters[3].toPay, 1100);
});

test("safeHarbor: withholding counts evenly, and under $1,000 owed or $0 last year means none required", () => {
  const withheld = T.safeHarbor(desk(), 2026, { today: "2026-01-02", project: false, withholding: 1000 });
  near(withheld.required, 2722.38 - 0); // 90% of total
  near(withheld.quarters[0].toPay, 2722.38 / 4 - 250);
  assert.equal(T.safeHarbor(desk({ income: 4000 }), 2026, { today: "2026-01-02", project: false }).exempt, true);
  const zero = T.safeHarbor(desk(), 2026, { today: "2026-01-02", project: false, priorYearTax: 0 });
  assert.equal(zero.exempt, true);
  assert.equal(zero.quarters.reduce((a, q) => a + q.toPay, 0), 0);
});

test("scheduleC maps income, categories and mileage to lines and the totals agree with taxSummary", () => {
  const d = desk({ income: 12000, miles: 100, expenses: [
    { id: "e1", date: "2026-02-01", amount: 85, category: "training", note: "CPR" },
    { id: "e2", date: "2026-03-01", amount: 40, category: "supplies" },
    { id: "e3", date: "2026-04-01", amount: 120, category: "advertising" },
    { id: "e4", date: "2026-05-01", amount: 300, category: "phone" },
    { id: "e5", date: "2026-05-02", amount: 250, category: "insurance" },
    { id: "e6", date: "2026-05-03", amount: 30, category: "petsitting-gear" },
  ] });
  const c = T.scheduleC(d, 2026, "2027-01-01");
  assert.equal(c.lineTotals["1"], 12000);
  assert.equal(c.lineTotals["22"], 40);
  assert.equal(c.lineTotals["8"], 120);
  assert.equal(c.lineTotals["25"], 300);
  assert.equal(c.lineTotals["15"], 250);
  assert.equal(c.lineTotals["27a"], 115); // training + an unknown category
  assert.equal(c.lineTotals["9"], 72.5); // 100 miles at 72.5 cents (before July 1)
  assert.equal(c.businessMiles, 100);
  const s = E.taxSummary(d, 2026, "2027-01-01");
  assert.equal(c.netProfit, s.net);
});

test("scheduleCCSV is parseable, guards against formula injection and lists each receipt", () => {
  const d = desk({ expenses: [{ id: "e1", date: "2026-02-01", amount: 10, category: "supplies", note: "=HYPERLINK(\"x\"), crayons" }] });
  const csv = T.scheduleCCSV(d, 2026, "2027-01-01");
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "section,schedule_c_line,line_label,description,date,amount,miles");
  assert.ok(lines.some((l) => l.startsWith("line,1,Gross receipts or sales,")));
  assert.ok(lines.some((l) => l.startsWith("line,31,Net profit,")));
  const receipt = lines.find((l) => l.startsWith("receipt,"));
  assert.match(receipt, /^receipt,22,Supplies,"Supplies/);
  assert.equal(T.toCSV([["=1+1", "a,b"]]), `"'=1+1","a,b"\r\n`);
});

test("yearSummaryHTML carries the numbers, escapes names and the no-warranty clause", () => {
  const d = desk();
  d.profile.businessName = "<b>Grace</b>";
  const html = T.yearSummaryHTML(d, 2026, "2027-02-01");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /\$3,024\.8\d/);
  assert.match(html, /&lt;b&gt;Grace/);
  assert.match(html, /2027-01-15/);
});

test("taxInputs defaults to single and ignores a bad filing status", () => {
  const d = desk({ taxes: { filing: "mfs" } });
  assert.equal(T.taxInputs(d, 2026).filing, "single");
  assert.deepEqual(T.taxInputs(E.emptyDesk(), 2026).payments, []);
});
