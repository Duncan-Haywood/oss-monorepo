import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, PRESETS, clean, capex, rampFactor, peakKw, year, npvOf, irrOf, paybackYears, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
// A site where every line is easy to do by hand: 1 port, no ramp, no escalation, no fees.
const simple = (o = {}) => clean({
  ...Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, 0])),
  ports: 1, kwPerPort: 10, hardwarePerPort: 10000, installPerPort: 0, price: 1, sessionsPerPortPerDay: 1, kwhPerSession: 10,
  rampStartPct: 100, rampYears: 1, years: 5, simultaneity: 100, ...o,
});

test("year lines match a hand calculation", () => {
  const i = simple({ energyCost: 0.2, demandCharge: 10, networkFeePerPortMonth: 10, processingPct: 10, processingFixed: 1, hostSharePct: 10, maintenancePct: 10, otherFixedPerYear: 100 });
  const y = year(i, 1);
  near(y.sessions, 365);
  near(y.kwh, 3650);
  near(y.revenue, 3650);
  near(y.energy, 730);
  near(y.demandCost, 10 * 10 * 12);
  near(y.processing, 365 + 365);
  near(y.host, 365);
  near(y.network, 120);
  near(y.maintenance, 1000);
  near(y.net, 3650 - (730 + 1200 + 730 + 365 + 120 + 1000 + 100));
});

test("capex subtracts incentives; npv with a zero rate is the plain sum", () => {
  const i = simple({ installPerPort: 2000, makeReady: 3000, incentives: 5000 });
  near(capex(i), 10000 + 2000 + 3000 - 5000);
  near(npvOf(i), -capex(i) + 5 * 3650);
});

test("payback is interpolated inside the year and null beyond the horizon", () => {
  const i = simple({ years: 10 });
  near(paybackYears(i), 10000 / 3650);
  assert.equal(paybackYears(simple({ years: 2 })), null);
});

test("irr makes npv zero", () => {
  const i = simple({ years: 5 });
  const r = irrOf(i);
  const j = { ...i, discountPct: r * 100 };
  near(npvOf(j), 0, 1e-3);
  assert.equal(irrOf(simple({ price: 0 })), null);
});

test("ramp goes linearly from the start share to 1 and then holds", () => {
  const i = clean({ ...DEFAULTS, rampStartPct: 40, rampYears: 4 });
  near(rampFactor(i, 1), 0.4);
  near(rampFactor(i, 2), 0.6);
  near(rampFactor(i, 4), 1);
  near(rampFactor(i, 9), 1);
});

test("site power cap limits the billed peak but never raises it", () => {
  const i = clean({ ...DEFAULTS, ports: 4, kwPerPort: 150, simultaneity: 50, sitePowerCap: 200 });
  near(peakKw(i), 200);
  near(peakKw({ ...i, sitePowerCap: 500 }), 300);
  near(peakKw({ ...i, sitePowerCap: 0 }), 300);
});

test("escalation compounds from year two", () => {
  const i = simple({ priceEscPct: 10, energyEscPct: 5, energyCost: 0.1 });
  near(year(i, 3).price, 1.21);
  near(year(i, 3).energy, 3650 * 0.1 * 1.05 ** 2);
});

test("break-even sessions and price put npv at zero", () => {
  const a = analyze(PRESETS.dcfc);
  assert.ok(a.ok);
  near(npvOf(a.inputs, { sessionsPerPortPerDay: a.sessionsBreakEven }), 0, 1);
  near(npvOf(a.inputs, { price: a.priceBreakEven }), 0, 1);
  assert.ok(npvOf(a.inputs, { sessionsPerPortPerDay: a.sessionsBreakEven * 1.1 }) > 0);
});

test("a price below energy cost has no break-even utilization", () => {
  const a = analyze({ ...PRESETS.dcfc, price: 0.1 });
  assert.equal(a.sessionsBreakEven, null);
  assert.ok(a.warnings.some((w) => /at or below your energy cost/.test(w)));
});

test("demand charges can turn a profitable site into a loss, and the table shows it", () => {
  const a = analyze(PRESETS.dcfc);
  const [none, , full, high] = a.demandRows;
  assert.ok(none.npv > full.npv && full.npv > high.npv);
  const low = analyze({ ...PRESETS.dcfc, sessionsPerPortPerDay: 2 });
  assert.ok(low.npv < 0);
  assert.ok(low.margins.demandShare > a.margins.demandShare);
});

test("the NPV grid rises with sessions and with price", () => {
  const a = analyze(PRESETS.dcfc);
  for (let r = 0; r < 5; r++) for (let c = 1; c < 5; c++) assert.ok(a.grid[r][c] > a.grid[r][c - 1]);
  for (let c = 0; c < 5; c++) for (let r = 1; r < 5; r++) assert.ok(a.grid[r][c] > a.grid[r - 1][c]);
  near(a.grid[2][2], a.npv, 1e-6);
});

test("level 2 preset analyses and has no demand-charge drag", () => {
  const a = analyze(PRESETS.level2);
  assert.ok(a.ok);
  near(a.mature.demandCost, 0);
});

test("missing inputs are reported rather than computed", () => {
  const a = analyze({});
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length >= 4);
});

test("an impossible utilization is flagged", () => {
  const a = analyze({ ...PRESETS.dcfc, sessionsPerPortPerDay: 80 });
  assert.ok(a.warnings.some((w) => /not credible/.test(w)));
});

test("junk text in a field counts as zero, and commas and dollar signs are read", () => {
  const i = clean({ ...DEFAULTS, ports: "abc", hardwarePerPort: "$75,000" });
  assert.equal(i.ports, 0);
  assert.equal(i.hardwarePerPort, 75000);
});

test("csv has a header, a row per year and the totals", () => {
  const a = analyze(PRESETS.dcfc);
  const lines = toCsv(a).split("\n");
  assert.match(lines[0], /^"Year"/);
  assert.equal(lines.length, 1 + a.rows.length + 3);
  assert.match(toCsv(a), /"NPV"/);
});
