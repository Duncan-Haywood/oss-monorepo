import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, annualDebtService, loanForDebtService, SAMPLE, LENDER_DSCR } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("sample: income, expenses and NOI add up by hand", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  near(r.egi, 240000 * 0.93 + 6000); // 229,200
  near(r.mgmtCost, 11460);
  near(r.opex, 28000 + 9000 + 12000 + 14000 + 11460 + 6000 + 3000); // 83,460
  near(r.noi, 145740);
  near(r.value, 145740 / 0.07);
  near(r.expenseRatio, 83460 / 229200, 1e-9);
});

test("financing: loan, payment, DSCR, cash-on-cash and implied cap rate", () => {
  const f = compute(SAMPLE).financing;
  near(f.loan, 1400000);
  near(f.equity, 600000);
  const r = 0.0675 / 12, n = 300;
  near(f.ds, 1400000 * r / (1 - Math.pow(1 + r, -n)) * 12);
  near(f.dscr, 145740 / f.ds, 1e-9);
  near(f.cashFlow, 145740 - f.ds);
  near(f.cashOnCash, f.cashFlow / 600000, 1e-9);
  near(f.impliedCap, 145740 / 2000000, 1e-9);
  near(f.priceVsValue, 2000000 - 145740 / 0.07);
});

test("break-even occupancy: at that occupancy cash flow is zero", () => {
  const f = compute(SAMPLE).financing;
  const p = { ...SAMPLE, vacancy: (1 - f.breakevenOcc) * 100 };
  const again = compute(p);
  near(again.noi - again.financing.ds, 0, 1);
});

test("max loan at the lender DSCR round-trips through debt service", () => {
  const ds = annualDebtService(1000000, 7, 30);
  near(loanForDebtService(ds, 7, 30), 1000000, 0.5);
  const f = compute(SAMPLE).financing;
  near(annualDebtService(f.maxLoan, SAMPLE.rate, SAMPLE.years), compute(SAMPLE).noi / LENDER_DSCR, 1);
});

test("zero-interest loan amortises straight-line", () => {
  near(annualDebtService(120000, 0, 10), 12000);
});

test("price 0 skips financing; all-cash with ltv 0 has no DSCR", () => {
  assert.equal(compute({ ...SAMPLE, price: 0 }).financing, undefined);
  const cash = compute({ ...SAMPLE, ltv: 0 });
  assert.equal(cash.financing.dscr, null);
  assert.ok(cash.findings.some((f) => /All-cash/.test(f.title)));
});

test("negative NOI gives no value and says so", () => {
  const r = compute({ ...SAMPLE, tax: 500000 });
  assert.equal(r.value, 0);
  assert.ok(r.findings.some((f) => /no value/.test(f.title)));
});

test("sensitivity grid: higher cap rate and higher vacancy both lower value", () => {
  const g = compute(SAMPLE).sensitivity;
  assert.deepEqual(g.caps, [6, 6.5, 7, 7.5, 8]);
  for (const row of g.rows) for (let i = 1; i < row.values.length; i++) assert.ok(row.values[i] < row.values[i - 1]);
  for (let c = 0; c < g.caps.length; c++) assert.ok(g.rows[1].values[c] < g.rows[0].values[c]);
});

test("flags a thin expense ratio, a low DSCR and a low vacancy", () => {
  const r = compute({ ...SAMPLE, tax: 1000, insurance: 1000, utilities: 0, maintenance: 1000, vacancy: 2, ltv: 90 });
  const t = r.findings.map((f) => f.title).join("\n");
  assert.match(t, /only .*% of income/);
  assert.match(t, /optimistic/);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, gpr: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, capRate: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, vacancy: 101 }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: 0 }).errors.length);
  assert.ok(parse({}).errors.length >= 10);
});

test("summary names its sources and the sensitivity grid", () => {
  const s = summaryText(compute(SAMPLE));
  assert.match(s, /not an appraisal/);
  assert.match(s, /Value by cap rate/);
  assert.match(s, /Verify against/);
});

// Added by the 2026-11-20 quality audit (portfolio/quality/audits/2026-11-20-commercial-property-cap-rate-calculator.json).
test("grid centre column is the cap rate typed, even a quarter point", () => {
  const r = compute({ ...SAMPLE, capRate: 7.25 });
  assert.deepEqual(r.sensitivity.caps, [6.25, 6.75, 7.25, 7.75, 8.25]);
  near(r.sensitivity.rows[0].values[2], r.value); // 145,740 / 0.0725 = 2,010,206.90
  near(r.value, 2010206.9, 0.01);
});

test("the 1.25x loan size is reported when the deal passes coverage too", () => {
  const r = compute(SAMPLE); // DSCR 1.2556x
  const t = r.findings.map((f) => f.title).join("\n");
  assert.match(t, /coverage test alone would allow a loan of up to \$1,406,258/); // PV of 145,740/1.25 a year, 6.75%, 25 yr
  assert.ok(r.findings.find((f) => /coverage ratio is 1\.26x/.test(f.title)).severity === "info");
});

test("a DSCR under 1.25x is high severity and sizes the loan down", () => {
  const r = compute({ ...SAMPLE, ltv: 90 }); // loan 1.8M, DSCR ~0.98x
  const f = r.findings.find((x) => /coverage ratio/.test(x.title));
  assert.equal(f.severity, "high");
  assert.match(f.title, /under the 1\.25x/);
  near(r.financing.maxLoan, 1406258.2, 0.5); // under the 95%-of-price cap
  near(compute({ ...SAMPLE, price: 1000000, ltv: 90 }).financing.maxLoan, 950000); // 95%-of-price cap binds
});

test("break-even above 100% says the building cannot cover debt fully leased", () => {
  const r = compute({ ...SAMPLE, ltv: 95, rate: 9, vacancy: 30 });
  assert.ok(r.financing.breakevenOcc > 1);
  assert.match(r.findings.map((f) => f.title).join("\n"), /Even fully leased .* above 100%/);
});

test("vacancy and expense-ratio flag thresholds sit at 5% and 30%", () => {
  const titles = (o) => compute({ ...SAMPLE, ...o }).findings.map((f) => f.title).join("\n");
  assert.match(titles({ vacancy: 4.9 }), /optimistic/);
  assert.doesNotMatch(titles({ vacancy: 5 }), /optimistic/);
  // expense ratio just under and just over 30%: scale tax to move opex around 0.3 x EGI (229,200)
  const fixedOther = 9000 + 12000 + 14000 + 6000 + 3000 + 11460; // 55,460
  assert.match(titles({ tax: Math.floor(0.29 * 229200 - fixedOther) }), /only .*% of income/);
  assert.doesNotMatch(titles({ tax: Math.ceil(0.31 * 229200 - fixedOther) }), /only .*% of income/);
});
