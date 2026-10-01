import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProducts, analyze, unitCost, reportCsv, sampleProducts, money, money2, pct } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const rows = (t) => { const p = parseProducts(t); assert.ok(p.rows, p.error); return p.rows; };
// One product: retail 20, wholesale 10, 8 oz wax, 2 other, 30 min, 100 units.
// Wax $4/lb, fragrance $2/oz at 10% load, no waste, $20/h, fees 10% marketplace + 0 payment.
const ONE = "Jar,20,10,8,2,30,100";
const OPTS = { waxPerLb: 4, fragrancePerOz: 2, fragrancePct: 10, wastePct: 0, hourlyWage: 20, marketplaceFeePct: 10, paymentFeePct: 0, wholesaleSharePct: 0, fairSharePct: 0, overheadMonthly: 0, fairBoothMonthly: 0, targetMarginPct: 50, waxIncreasePct: 10 };

test("parses header, tabs, blanks and skips", () => {
  const p = parseProducts("product,retail,wholesale,wax oz,other,min,units\nJar,$24,12,8,3.2,12,120\nTin\t12\t6\t4\nbad\nNoWax,10,5,0\nNeg,-1,0,4");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Jar", retail: 24, wholesale: 12, waxOz: 8, other: 3.2, minutes: 12, units: 120 });
  assert.deepEqual(p.rows[1], { name: "Tin", retail: 12, wholesale: 6, waxOz: 4, other: 0, minutes: 0, units: 0 });
  assert.match(p.warnings[0], /3 line/);
  assert.ok(parseProducts("").error);
});

test("unit cost: wax, fragrance by wax weight, labor, waste gross-up", () => {
  const [p] = rows(ONE);
  const c = unitCost(p, { ...OPTS });
  near(c.wax, 2); near(c.fragrance, 1.6); near(c.labor, 10); near(c.total, 15.6);
  const w = unitCost(p, { ...OPTS, wastePct: 20 });
  near(w.wax, 2.5); near(w.fragrance, 2); near(w.total, 2.5 + 2 + 2 + 10);
});

test("online and wholesale net, margin and price floor", () => {
  const r = analyze(rows(ONE), OPTS);
  const l = r.lines[0];
  near(l.onlineNet, 20 * 0.9 - 15.6);
  near(l.wholesaleNet, 10 - 15.6);
  near(l.onlineMargin, (18 - 15.6) / 20);
  near(l.floorOnline, 15.6 / (0.9 - 0.5));
  near(l.floorWholesale, 31.2);
  assert.equal(l.underFloor, true);
  assert.ok(r.warnings.some((w) => /below the retail price/.test(w)));
  assert.ok(r.warnings.some((w) => /wholesale price/.test(w)));
});

test("channel mix blends nets and month result", () => {
  const r = analyze(rows(ONE), { ...OPTS, wholesaleSharePct: 50, overheadMonthly: 100 });
  const l = r.lines[0];
  near(l.blendedNet, 0.5 * (18 - 15.6) + 0.5 * (10 - 15.6));
  near(r.month.contribution, 100 * l.blendedNet);
  near(r.month.net, 100 * l.blendedNet - 100);
  near(r.month.hours, 50);
});

test("fair channel pays only the payment fee and booth is fixed cost", () => {
  const r = analyze(rows(ONE), { ...OPTS, paymentFeePct: 5, fairSharePct: 100, fairBoothMonthly: 80 });
  near(r.lines[0].fairNet, 20 * 0.95 - 15.6);
  near(r.month.fixed, 80);
});

test("break-even units and effective hourly", () => {
  const r = analyze(rows("Jar,40,20,8,2,30,100"), { ...OPTS, overheadMonthly: 500 });
  const avg = 40 * 0.9 - 15.6;
  near(r.month.avgNet, avg);
  near(r.month.breakEvenUnits, 500 / avg);
  near(r.month.effectiveHourly, (r.month.net + 100 * 10) / 50);
});

test("wax shock re-costs wax only", () => {
  const r = analyze(rows(ONE), { ...OPTS, waxIncreasePct: 25 });
  near(r.month.waxLoss, 100 * 2 * 0.25);
});

test("warnings for free wax and free time; validation errors", () => {
  const r = analyze(rows(ONE), { ...DEFAULTS_ZERO() });
  assert.ok(r.warnings.some((w) => /Wax cost per pound is zero/.test(w)));
  assert.ok(r.warnings.some((w) => /Hourly wage is zero/.test(w)));
  assert.ok(analyze(rows(ONE), { ...OPTS, wastePct: 60 }).error);
  assert.ok(analyze(rows(ONE), { ...OPTS, fragrancePct: 40 }).error);
  assert.ok(analyze(rows(ONE), { ...OPTS, marketplaceFeePct: 100 }).error);
  assert.ok(analyze(rows(ONE), { ...OPTS, wholesaleSharePct: 70, fairSharePct: 40 }).error);
  assert.ok(analyze(rows(ONE), { ...OPTS, targetMarginPct: 100 }).error);
  assert.ok(analyze(rows(ONE), { ...OPTS, waxPerLb: "x" }).error);
});
function DEFAULTS_ZERO() { return { waxPerLb: 0, hourlyWage: 0 }; }

test("sample loads, analyzes and exports CSV", () => {
  const r = analyze(rows(sampleProducts()), { ...OPTS, hourlyWage: 18, wastePct: 5, wholesaleSharePct: 20, overheadMonthly: 400 });
  assert.ok(!r.error);
  assert.equal(r.lines.length, 4);
  const csv = reportCsv(r);
  assert.match(csv, /^Product,Retail/);
  assert.equal(csv.split("\n")[0].split(",").length, 9);
});

test("formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
  assert.equal(pct(0.1234), "12.3%");
});
