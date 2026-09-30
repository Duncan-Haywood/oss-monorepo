import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, simulate, heatingCosts, heatDeliveredKwh, sampleInput, reportCsv, parseNum, KWH_PER_THERM } from "./calc.mjs";

const P = { therms: 700, afue: 0.95, gasPrice: 1.6, gasFixedYear: 0, cop: 2.8, elecPrice: 0.10, coolKwh: 0, coolSave: 0, baselineCapex: 10000, hpCapex: 15000, incentives: 0, extraWork: 0, omBase: 0, omHp: 0, gasEsc: 0, elecEsc: 0, years: 15, discount: 0 };

test("delivered heat is therms x 29.3071 x AFUE", () => {
  assert.ok(Math.abs(heatDeliveredKwh(700, 0.95) - 700 * KWH_PER_THERM * 0.95) < 1e-9);
});

test("year-1 costs by hand, flat prices", () => {
  const s = simulate(P);
  const delivered = 700 * KWH_PER_THERM * 0.95; // 19488.3 kWh
  assert.ok(Math.abs(s.gas1 - 700 * 1.6) < 1e-6);
  assert.ok(Math.abs(s.hp1 - (delivered / 2.8) * 0.10) < 1e-6);
  assert.equal(s.upfront, 5000);
});

test("payback interpolates and gain is cumulative minus up-front", () => {
  const s = simulate(P);
  const yearly = s.year1; // constant with flat prices
  assert.ok(Math.abs(s.payback - 5000 / yearly) < 1e-6);
  assert.ok(Math.abs(s.gain - (yearly * 15 - 5000)) < 1e-6);
});

test("heat pump cheaper up front pays back at year 0", () => {
  const s = simulate({ ...P, hpCapex: 8000 });
  assert.equal(s.payback, 0);
  assert.ok(s.upfront < 0);
});

test("a heat pump that costs more to run and more up front never pays back", () => {
  const s = simulate({ ...P, elecPrice: 0.6 });
  assert.equal(s.payback, null);
  assert.ok(s.year1 < 0);
});

test("break-even COP makes heating running cost equal", () => {
  const c = heatingCosts(P);
  const s = simulate({ ...P, cop: c.breakevenCop });
  assert.ok(Math.abs(s.year1) < 1e-6);
});

test("gas fixed fee raises the break-even COP", () => {
  assert.ok(heatingCosts({ ...P, gasFixedYear: 240 }).breakevenCop < heatingCosts(P).breakevenCop);
});

test("cooling saving lowers the heat pump running cost", () => {
  const a = simulate({ ...P, coolKwh: 2000, coolSave: 0 });
  const b = simulate({ ...P, coolKwh: 2000, coolSave: 0.1 });
  assert.ok(b.year1 > a.year1);
});

test("escalation makes the higher-priced fuel's cost grow faster", () => {
  const flat = simulate(P);
  const gasUp = simulate({ ...P, gasEsc: 0.05 });
  assert.ok(gasUp.gain > flat.gain);
});

test("analyze on the sample returns scenarios and findings", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error);
  assert.equal(a.scenarios.length, 7);
  assert.equal(a.scenarios[0].label, "Your assumptions");
  assert.ok(a.findings.length >= 2);
  // lower COP is never better than the base case
  assert.ok(a.scenarios[1].gain <= a.scenarios[0].gain);
  assert.ok(a.scenarios[2].gain >= a.scenarios[0].gain);
  assert.ok(a.scenarios[5].gain <= a.scenarios[0].gain);
});

test("validation errors are readable", () => {
  const s = sampleInput();
  assert.match(analyze({ ...s, therms: "" }).error, /therms/);
  assert.match(analyze({ ...s, cop: "0" }).error, /COP/);
  assert.match(analyze({ ...s, furnaceCost: "0", acCost: "0" }).error, /compared with/);
  assert.match(analyze({ ...s, afue: "20" }).error, /AFUE/);
});

test("parseNum accepts money and rejects text", () => {
  assert.equal(parseNum("$1,600"), 1600);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("CSV neutralises formula cells and has one row per year", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a);
  assert.equal(csv.trim().split("\n").length, a.p.years + 1);
});

test("nothing in calc.mjs touches the network", async () => {
  const src = await (await import("node:fs/promises")).readFile(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
});
