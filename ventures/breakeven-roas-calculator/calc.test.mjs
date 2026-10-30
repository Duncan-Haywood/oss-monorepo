import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, num, normalizeInputs, orderEconomics, repeatContribution, lifetime, targetFor, breakEven,
  scenarioTable, sensitivity, checkCampaign, checkMer, scenarioCsv, sensitivityCsv, fmtMoney, fmtRoas, fmtPct,
  exampleInputs, round2,
} from "./calc.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const base = (over = {}) => normalizeInputs({ ...DEFAULTS, ...over }).inputs;
// Simplest case: $100 price, $40 cost, nothing else.
const simple = (over = {}) => base({ price: 100, discountPct: 0, cogs: 40, shippingCost: 0, shippingCharged: 0, paymentPct: 0, paymentFixed: 0, platformPct: 0, returnPct: 0, restockPct: 0, returnShipCost: 0, ordersPerCustomer: 1, repeatMarginPct: 100, ...over });

test("num parses currency, percent and rejects junk", () => {
  assert.equal(num("$1,234.50"), 1234.5);
  assert.equal(num(" 20% "), 20);
  assert.equal(num(7), 7);
  assert.equal(num(".5"), 0.5);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.ok(Number.isNaN(num(null)));
  assert.ok(Number.isNaN(num("1e3x")));
});

test("textbook case: 60% gross margin gives break-even ROAS 1.67 and max CPA 60", () => {
  const b = breakEven(simple());
  close(b.maxCpa, 60);
  close(b.roas, 100 / 60);
  close(b.ceilingMarginPct, 60);
});

test("max CPA times break-even ROAS equals reported revenue", () => {
  for (const over of [{}, { returnPct: 15, platformPct: 8 }, { discountPct: 25, shippingCharged: 6 }]) {
    const b = breakEven(base(over));
    close(b.maxCpa * b.roas, b.economics.reported, 1e-9);
  }
});

test("discount lowers reported revenue but not COGS", () => {
  const e = orderEconomics(simple({ discountPct: 20 }));
  close(e.reported, 80);
  close(e.contribution, 40);
  close(breakEven(simple({ discountPct: 20 })).roas, 2);
});

test("payment fee is a percent of revenue plus a fixed amount, on every order", () => {
  const e = orderEconomics(simple({ paymentPct: 3, paymentFixed: 0.3 }));
  close(e.paymentFee, 3.3);
  close(e.contribution, 100 - 40 - 3.3);
});

test("refunds hand revenue back, keep the payment fee, and take COGS unless restocked", () => {
  const e = orderEconomics(simple({ returnPct: 10, paymentPct: 3 }));
  close(e.refunds, 10);
  close(e.kept, 90);
  close(e.paymentFee, 3); // charged on the full 100, not refunded
  close(e.cogs, 40);
  close(e.contribution, 90 - 3 - 40);
  const restocked = orderEconomics(simple({ returnPct: 10, restockPct: 100 }));
  close(restocked.cogs, 36);
  close(restocked.contribution, 90 - 36);
});

test("platform fee applies to kept revenue only; return shipping only to returned orders", () => {
  const e = orderEconomics(simple({ returnPct: 20, platformPct: 10, shippingCost: 5, returnShipCost: 10 }));
  close(e.kept, 80);
  close(e.platformFee, 8);
  close(e.shipping, 5 + 2);
  close(e.contribution, 80 - 8 - 40 - 7);
});

test("shipping charged to the customer counts as reported revenue", () => {
  const e = orderEconomics(simple({ shippingCharged: 8, shippingCost: 8 }));
  close(e.reported, 108);
  close(e.contribution, 108 - 40 - 8);
});

test("a product that loses money before ads has no reachable break-even", () => {
  const b = breakEven(simple({ cogs: 120 }));
  assert.equal(b.losesBeforeAds, true);
  assert.equal(b.roas, Infinity);
  assert.equal(b.maxCpa, 0);
  assert.equal(fmtRoas(b.roas), "not reachable");
});

test("contribution of exactly zero is also not reachable", () => {
  assert.equal(breakEven(simple({ cogs: 100 })).roas, Infinity);
});

test("target ROAS for a desired margin: 20% margin on $100 with $60 contribution", () => {
  const t = targetFor(simple(), 20);
  close(t.maxCpa, 40);
  close(t.roas, 2.5);
  assert.equal(t.feasible, true);
});

test("target margin above the ceiling is unreachable, at the ceiling is too", () => {
  const t = targetFor(simple(), 70);
  assert.equal(t.feasible, false);
  assert.equal(t.roas, Infinity);
  close(t.rawMaxCpa, -10);
  assert.equal(targetFor(simple(), 60).feasible, false);
});

test("target ROAS rises as the margin target rises", () => {
  const rows = scenarioTable(simple(), [0, 10, 20, 30, 40, 50]);
  for (let k = 1; k < rows.length; k++) assert.ok(rows[k].first.roas > rows[k - 1].first.roas);
});

test("one order per customer makes the LTV basis equal the first-order basis", () => {
  const i = simple({ ordersPerCustomer: 1 });
  const rows = scenarioTable(i);
  for (const r of rows) {
    close(r.first.maxCpa, r.ltv.maxCpa);
    close(r.first.roas, r.ltv.roas);
  }
});

test("LTV: three orders at full repeat margin triples the allowable CPA", () => {
  const i = simple({ ordersPerCustomer: 3, repeatMarginPct: 100 });
  const l = lifetime(i);
  close(l.contribution, 180);
  close(l.revenue, 300);
  const b = breakEven(i);
  close(b.maxCpaLtv, 180);
  close(b.roasLtv, 100 / 180);
  close(b.roas, 100 / 60); // first-order view unchanged
});

test("LTV: repeat margin percent scales only the repeat orders", () => {
  const i = simple({ ordersPerCustomer: 2, repeatMarginPct: 50 });
  close(repeatContribution(i), 30);
  close(lifetime(i).contribution, 90);
});

test("LTV target margin is measured on lifetime revenue", () => {
  const i = simple({ ordersPerCustomer: 2, repeatMarginPct: 100 });
  const t = targetFor(i, 10, "ltv"); // contribution 120, lifetime revenue 200, profit 20
  close(t.maxCpa, 100);
  close(t.roas, 1);
});

test("fractional orders per customer interpolate", () => {
  close(lifetime(simple({ ordersPerCustomer: 1.5 })).contribution, 90);
});

test("scenario table has the requested margins in order", () => {
  const rows = scenarioTable(base());
  assert.deepEqual(rows.map((r) => r.marginPct), [0, 10, 20]);
  close(rows[0].first.roas, breakEven(base()).roas);
});

test("sensitivity: more returns and higher COGS both raise break-even ROAS", () => {
  const s = sensitivity(base());
  assert.equal(s.rows.length, 6);
  assert.equal(s.rows[0].cells.length, 5);
  for (const row of s.rows) for (let k = 1; k < row.cells.length; k++) assert.ok(row.cells[k].roas > row.cells[k - 1].roas);
  for (let c = 0; c < 5; c++) for (let k = 1; k < s.rows.length; k++) assert.ok(s.rows[k].cells[c].roas > s.rows[k - 1].cells[c].roas);
});

test("sensitivity at the baseline return rate and 0% COGS change equals break-even", () => {
  const i = base({ returnPct: 10 });
  const s = sensitivity(i, [10], [0]);
  close(s.rows[0].cells[0].roas, breakEven(i).roas);
});

test("sensitivity marks a row unreachable once COGS exceeds revenue", () => {
  const s = sensitivity(simple({ cogs: 90 }), [0], [0, 20]);
  assert.ok(Number.isFinite(s.rows[0].cells[0].roas));
  assert.equal(s.rows[0].cells[1].roas, Infinity);
});

test("campaign check: break-even spend gives profit 0 and exactly the break-even ROAS", () => {
  const i = simple();
  const be = breakEven(i).roas;
  const c = checkCampaign(i, { spend: 1000, revenue: 1000 * be });
  close(c.profit, 0, 1e-9);
  close(c.profitPerDollar, 0, 1e-12);
  assert.equal(c.verdict, "profit");
});

test("campaign check: ROAS 3 on a 60% margin product earns 0.80 per dollar", () => {
  const c = checkCampaign(simple(), { spend: 1000, revenue: 3000 });
  close(c.profit, 800);
  close(c.profitPerDollar, 0.8);
  close(c.roas, 3);
  close(c.cpa, 1000 / 30);
  assert.equal(c.ordersEstimated, true);
});

test("campaign check: ROAS 1.2 loses money first-order", () => {
  const c = checkCampaign(simple(), { spend: 1000, revenue: 1200 });
  close(c.profit, -280);
  assert.equal(c.verdict, "loss");
  assert.ok(c.roasGap < 0);
});

test("campaign check: a loss on the first order that LTV repays is flagged ltv-only", () => {
  const i = simple({ ordersPerCustomer: 3 });
  const c = checkCampaign(i, { spend: 1000, revenue: 1200 });
  assert.equal(c.verdict, "ltv-only");
  assert.ok(c.ltvProfit > 0);
  const worse = checkCampaign(i, { spend: 1000, revenue: 400 });
  assert.equal(worse.verdict, "loss");
});

test("campaign check with explicit orders handles an order value different from the price", () => {
  // 20 orders reported 3000 revenue ($150 AOV) vs $100 price; per-order costs scale with orders.
  const i = simple({ cogs: 40 });
  const c = checkCampaign(i, { spend: 500, revenue: 3000, orders: 20 });
  close(c.contribution, 3000 - 20 * 40);
  close(c.profit, 3000 - 800 - 500);
  assert.equal(c.ordersEstimated, false);
});

test("campaign check agrees with the per-order contribution when AOV matches", () => {
  const i = base({ returnPct: 12, platformPct: 6, restockPct: 40, returnShipCost: 4 });
  const e = orderEconomics(i);
  const k = 37;
  const c = checkCampaign(i, { spend: 900, revenue: k * e.reported, orders: k });
  close(c.contribution, k * e.contribution, 1e-8);
});

test("campaign check against a margin target", () => {
  const i = simple();
  const ok = checkCampaign(i, { spend: 1000, revenue: 3000, targetMarginPct: 20 }); // profit 800 / 3000 = 26.7%
  assert.equal(ok.meetsTarget, true);
  const no = checkCampaign(i, { spend: 1000, revenue: 2000, targetMarginPct: 20 }); // profit 200 / 2000 = 10%
  assert.equal(no.meetsTarget, false);
  close(no.targetRoas, 2.5);
});

test("campaign check validates its inputs", () => {
  assert.ok(checkCampaign(simple(), { spend: 0, revenue: 100 }).error);
  assert.ok(checkCampaign(simple(), { spend: "x", revenue: 100 }).error);
  assert.ok(checkCampaign(simple(), { spend: 100, revenue: -5 }).error);
});

test("zero revenue is a total loss, not a crash", () => {
  const c = checkCampaign(simple(), { spend: 100, revenue: 0 });
  close(c.profit, -100);
  assert.equal(c.marginOfRevenuePct, null);
});

test("MER check compares blended revenue per ad dollar with break-even", () => {
  const i = simple();
  const m = checkMer(i, { totalRevenue: 50000, totalSpend: 20000 });
  close(m.mer, 2.5);
  assert.equal(m.clears, true);
  assert.equal(checkMer(i, { totalRevenue: 30000, totalSpend: 20000 }).clears, false);
  assert.ok(checkMer(i, { totalRevenue: 100, totalSpend: 0 }).error);
  assert.equal(checkMer(simple({ cogs: 150 }), { totalRevenue: 100, totalSpend: 10 }).clears, false);
});

test("normalizeInputs rejects out-of-range and non-numeric values", () => {
  assert.ok(normalizeInputs({ ...DEFAULTS, price: "" }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, price: 0 }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, returnPct: 120 }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, discountPct: 100 }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, cogs: -1 }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, ordersPerCustomer: 0.5 }).errors.length);
  assert.ok(normalizeInputs({ ...DEFAULTS, cogs: "lots" }).errors[0].includes("not a number"));
  assert.deepEqual(normalizeInputs(DEFAULTS).errors, []);
});

test("blank optional fields mean zero, and blank orders per customer means one", () => {
  const { inputs, errors } = normalizeInputs({ price: "50", cogs: "", ordersPerCustomer: "", repeatMarginPct: "" });
  assert.deepEqual(errors, []);
  assert.equal(inputs.cogs, 0);
  assert.equal(inputs.ordersPerCustomer, 1);
  assert.equal(inputs.repeatMarginPct, 100);
});

test("scenario CSV: header, one row per margin, n/a for unreachable, no formula-leading cells", () => {
  const csv = scenarioCsv(scenarioTable(simple(), [0, 20, 80]));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^Target net margin %,Max CPA first order/);
  assert.equal(lines[1].split(",")[0], "0");
  assert.equal(lines[1].split(",")[2], "1.67");
  assert.match(lines[3], /n\/a/);
  assert.match(lines[3], /,no,/);
  for (const line of lines.slice(1)) for (const cell of line.split(",")) assert.doesNotMatch(cell, /^[=+@-]/);
});

test("sensitivity CSV has one row per return rate and a column per COGS change, twice", () => {
  const lines = sensitivityCsv(sensitivity(base())).trim().split("\n");
  assert.equal(lines.length, 7);
  assert.equal(lines[0].split(",").length, 1 + 5 + 5);
  assert.ok(lines[0].includes("(COGS -20%)"));
  assert.ok(lines[0].includes("(COGS +20%)"));
});

test("formatters", () => {
  assert.equal(fmtMoney(1234.5), "$1,234.50");
  assert.equal(fmtMoney(-3), "-$3.00");
  assert.equal(fmtMoney(Infinity), "n/a");
  assert.equal(fmtRoas(2.0658), "2.07x");
  assert.equal(fmtPct(12.34), "12.3%");
  assert.equal(round2(1.005 + 1e-9), 1.01);
});

test("the example is a coherent, reachable set of inputs", () => {
  const { inputs, errors } = normalizeInputs(exampleInputs());
  assert.deepEqual(errors, []);
  const b = breakEven(inputs);
  assert.ok(b.roas > 1 && b.roas < 4);
  assert.ok(b.roasLtv < b.roas);
});

test("property: random inputs keep the identities", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let k = 0; k < 300; k++) {
    const i = base({ price: 20 + rnd() * 300, discountPct: rnd() * 40, cogs: rnd() * 120, shippingCost: rnd() * 15, shippingCharged: rnd() * 10, paymentPct: rnd() * 4, paymentFixed: rnd(), platformPct: rnd() * 15, returnPct: rnd() * 30, restockPct: rnd() * 100, returnShipCost: rnd() * 10, ordersPerCustomer: 1 + rnd() * 3, repeatMarginPct: rnd() * 150 });
    const b = breakEven(i);
    if (b.losesBeforeAds) { assert.equal(b.roas, Infinity); continue; }
    // Spending exactly the break-even CPA per order leaves zero profit.
    const e = b.economics;
    const c = checkCampaign(i, { spend: 100 * b.maxCpa, revenue: 100 * e.reported, orders: 100 });
    close(c.profit, 0, 1e-6);
    // LTV allowance is never smaller than the first-order allowance when repeat margin is non-negative.
    assert.ok(b.maxCpaLtv >= b.maxCpa - 1e-9);
    // Target ROAS at margin m satisfies profit = m * revenue.
    const t = targetFor(i, 5, "first");
    if (t.feasible) close(e.contribution - e.reported / t.roas, 0.05 * e.reported, 1e-9);
  }
});

test("num rejects exponent, hex and Infinity text instead of parsing it", () => {
  for (const bad of ["1e5", "0x10", "Infinity", "abc", ""]) assert.ok(Number.isNaN(num(bad)), bad);
  assert.equal(num("$1,234.50"), 1234.5);
});

test("campaign check: zero revenue and no orders gives no CPA, not Infinity", () => {
  const c = checkCampaign(simple(), { spend: 1000, revenue: 0 });
  assert.equal(c.cpa, null);
});
