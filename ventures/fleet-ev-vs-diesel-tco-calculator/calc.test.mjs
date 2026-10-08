import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, money2, tco, breakevenFuel, breakevenElectricity, breakevenMiles, sensitivity, feasibility } from "./calc.mjs";

// One vehicle, one year, no escalation, no discounting, no extras: hand-checkable.
const simple = {
  ...DEFAULTS, vehicles: 1, milesPerYear: 10000, years: 1, icePrice: 40000, iceMpg: 20, fuelPrice: 4,
  iceMaintPerMile: 0.1, iceResidualPct: 50, evPrice: 50000, incentivePerVehicle: 0, evKwhPerMile: 0.5,
  depotRate: 0.2, publicSharePct: 0, publicRate: 0.5, evMaintPerMile: 0.05, evResidualPct: 40,
  insuranceDeltaPerVehicle: 0, chargers: 0, chargerCost: 0, chargerIncentive: 0, chargerMaintPerYear: 0,
  peakKw: 0, demandRate: 0, fuelEscPct: 0, elecEscPct: 0, costEscPct: 0, discountPct: 0,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});

test("one vehicle, one year: costs match the hand calculation", () => {
  const t = tco(simple);
  // ICE: 40000 buy, 500 gal * $4 = 2000 fuel, 1000 maintenance, 20000 resale.
  assert.equal(t.iceUp, 40000);
  assert.equal(t.rows[0].iceFuel, 2000);
  assert.equal(t.rows[0].iceMaint, 1000);
  assert.equal(t.iceNom, 40000 + 3000 - 20000);
  // EV: 50000 buy, 5000 kWh * 0.2 = 1000 energy, 500 maintenance, 20000 resale.
  assert.equal(t.evUp, 50000);
  assert.equal(t.rows[0].evEnergy, 1000);
  assert.equal(t.evNom, 50000 + 1500 - 20000);
  assert.equal(t.savingsNom, t.iceNom - t.evNom);
  assert.equal(t.upfrontPremium, 10000);
});

test("incentives and chargers move only the up-front cost", () => {
  const t = tco({ ...simple, vehicles: 2, incentivePerVehicle: 7500, chargers: 2, chargerCost: 6000, chargerIncentive: 3000 });
  assert.equal(t.evUp, 2 * (50000 - 7500) + 12000 - 3000);
  assert.equal(t.iceUp, 80000);
});

test("incentive can never make the purchase negative", () => {
  assert.equal(tco({ ...simple, incentivePerVehicle: 999999 }).evUp, 0);
});

test("discounting shrinks later cash flows; zero rate leaves nominal equal to present value", () => {
  const flat = tco({ ...simple, years: 5 });
  assert.equal(flat.iceNpv, flat.iceNom);
  const disc = tco({ ...simple, years: 5, discountPct: 10 });
  assert.ok(disc.iceNpv < disc.iceNom + 1e-9 || disc.iceNom < disc.iceUp);
  // Year-1 running cost 3000 discounted one year at 10% and resale in year 5.
  const t1 = tco({ ...simple, years: 1, discountPct: 10 });
  assert.ok(Math.abs(t1.iceNpv - (40000 + (3000 - 20000) / 1.1)) < 1e-6);
});

test("escalation compounds from year 2, not year 1", () => {
  const t = tco({ ...simple, years: 3, fuelEscPct: 10 });
  assert.equal(t.rows[0].iceFuel, 2000);
  assert.ok(Math.abs(t.rows[1].iceFuel - 2200) < 1e-9);
  assert.ok(Math.abs(t.rows[2].iceFuel - 2420) < 1e-9);
});

test("public charging raises the blended rate", () => {
  const t = tco({ ...simple, publicSharePct: 50, publicRate: 0.6 });
  assert.ok(Math.abs(t.blendedRate - 0.4) < 1e-12);
});

test("demand charges and charger upkeep appear in EV operating cost", () => {
  const t = tco({ ...simple, peakKw: 10, demandRate: 10, chargers: 2, chargerMaintPerYear: 100 });
  assert.equal(t.rows[0].evDemand, 1200);
  assert.equal(t.rows[0].evMaint, 500 + 200);
});

test("payback is the first year cumulative EV cost reaches ICE cost; null if never", () => {
  const cheapFuel = tco({ ...simple, years: 10, fuelPrice: 0.1 });
  assert.equal(cheapFuel.payback, null);
  const dear = tco({ ...simple, years: 10, fuelPrice: 12, evPrice: 41000 });
  assert.ok(dear.payback >= 1 && dear.payback <= 10);
  assert.equal(tco({ ...simple, evPrice: 30000 }).payback, 0);
});

test("break-even fuel price makes savings exactly zero", () => {
  const o = { ...DEFAULTS };
  const f = breakevenFuel(o);
  assert.ok(Math.abs(tco({ ...o, fuelPrice: f }).savingsNpv) < 1e-6);
  assert.ok(tco({ ...o, fuelPrice: f + 1 }).savingsNpv > 0);
  assert.ok(tco({ ...o, fuelPrice: f - 1 }).savingsNpv < 0);
});

test("break-even miles and electricity rate make savings zero", () => {
  const o = { ...DEFAULTS };
  const m = breakevenMiles(o);
  assert.ok(Math.abs(tco({ ...o, milesPerYear: m }).savingsNpv) < 1e-6);
  const e = breakevenElectricity(o);
  assert.ok(Math.abs(tco({ ...o, depotRate: e }).savingsNpv) < 1e-6);
});

test("break-even is null when the answer does not exist", () => {
  // No per-mile saving at all: fuel price does nothing without miles.
  assert.equal(breakevenFuel({ ...DEFAULTS, milesPerYear: 0 }), null);
});

test("sensitivity grid: more expensive fuel only ever improves EV savings", () => {
  const g = sensitivity(DEFAULTS);
  for (const row of g) for (let i = 1; i < row.cells.length; i++) assert.ok(row.cells[i].savings > row.cells[i - 1].savings);
  assert.equal(g[0].cells.length, 6);
  assert.equal(g.length, 4);
});

test("feasibility: range after winter loss and overnight charging capacity", () => {
  const f = feasibility({ ...DEFAULTS, evRange: 200, rangeLossPct: 25, peakDayMiles: 140 });
  assert.equal(f.usableRange, 150);
  assert.ok(f.rangeOk);
  assert.equal(f.rangeMargin, 10);
  const bad = feasibility({ ...DEFAULTS, evRange: 100, rangeLossPct: 30, peakDayMiles: 90 });
  assert.equal(bad.rangeOk, false);
  const few = feasibility({ ...DEFAULTS, chargers: 1, vehicles: 5, peakDayMiles: 100, evKwhPerMile: 0.5, chargerKw: 10, overnightHours: 8 });
  assert.equal(few.chargingOk, false);
  assert.equal(few.needKwh, 250);
  assert.equal(few.chargersNeeded, 4);
});

test("hostile or empty input never throws and never yields NaN totals", () => {
  const t = tco({ vehicles: NaN, milesPerYear: -5, years: 0, icePrice: "x", discountPct: NaN });
  for (const k of ["iceNpv", "evNpv", "savingsNpv", "iceNom", "evNom"]) assert.ok(Number.isFinite(t[k]), k);
  assert.equal(tco({ ...DEFAULTS, years: 99 }).years, 20);
});
