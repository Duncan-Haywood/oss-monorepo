import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./calc.mjs";
import { onPeakFlags, greedyCaps, bestCaps, energyDP, monthBill, touBattery } from "./tou.mjs";

const bat = (kw, kwh, roundTrip = 1) => ({ kw, kwh, roundTrip });
const tariff = { facilityRate: 0, onStart: 16, onEnd: 21, weekdaysOnly: true, onDemandRate: 0, onPrice: 0.3, offPrice: 0.1 };

// 2026-06 has 22 weekdays (Mon 1st .. Tue 30th).
function month(fn, mo = 6) {
  const rows = [];
  const days = new Date(Date.UTC(2026, mo, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) for (let q = 0; q < 96; q++) rows.push({ t: Date.UTC(2026, mo - 1, d, Math.floor(q / 4), (q % 4) * 15), v: fn(d, q) });
  return rows;
}
const settings = (rate = "1") => ({ unit: "kw", intervalMin: "", demandRate: rate, ratchetPct: "", usablePct: "" });

test("on-peak window: weekdays only, end exclusive, and windows that wrap midnight", () => {
  const mon16 = Date.UTC(2026, 5, 1, 16, 0), mon2045 = Date.UTC(2026, 5, 1, 20, 45), mon21 = Date.UTC(2026, 5, 1, 21, 0), sat17 = Date.UTC(2026, 5, 6, 17, 0);
  assert.deepEqual(onPeakFlags([mon16, mon2045, mon21, sat17], tariff), [true, true, false, false]);
  assert.deepEqual(onPeakFlags([sat17], { ...tariff, weekdaysOnly: false }), [true]);
  const wrap = { onStart: 22, onEnd: 2, weekdaysOnly: false };
  assert.deepEqual(onPeakFlags([Date.UTC(2026, 5, 1, 23), Date.UTC(2026, 5, 1, 1), Date.UTC(2026, 5, 1, 3)], wrap), [true, true, false]);
});

test("arbitrage only: flat load, lossless battery saves full kWh x price spread every weekday", () => {
  const a = analyze(month(() => 20), settings());
  const r = touBattery(a, tariff, bat(10, 40));
  // 40 kWh moved from 0.30 to 0.10 per weekday; 22 weekdays; one month scaled to 12.
  const expected = 40 * 0.2 * 22 * 12;
  assert.ok(Math.abs(r.energySaving - expected) / expected < 0.005, `${r.energySaving} vs ${expected}`);
  assert.ok(Math.abs(r.demandSaving) < 1e-6);
});

test("arbitrage with losses matches hand arithmetic (eta = 0.9 each way)", () => {
  const a = analyze(month(() => 20), settings());
  const r = touBattery(a, tariff, bat(10, 40, 0.81));
  const perDay = 40 * 0.9 * 0.3 - (40 / 0.9) * 0.1; // delivered x on-peak price - grid kWh to refill x off-peak price
  const expected = perDay * 22 * 12;
  assert.ok(Math.abs(r.energySaving - expected) / expected < 0.01, `${r.energySaving} vs ${expected}`);
});

test("a spread too small to beat the losses is not traded", () => {
  const a = analyze(month(() => 20), settings());
  const r = touBattery(a, { ...tariff, onPrice: 0.105 }, bat(10, 40, 0.81));
  assert.ok(r.saving >= -1e-6 && r.saving < 1, String(r.saving));
});

test("on-peak demand charge: an off-peak spike is left alone, the on-peak spike is shaved", () => {
  // base 10 kW; weekday 17:00-17:15 spikes to 40 kW (on-peak); daily 03:00 spikes to 60 kW (off-peak)
  const rows = month((d, q) => (q === 68 ? 40 : q === 12 ? 60 : 10));
  const a = analyze(rows, settings());
  const r = touBattery(a, { ...tariff, onDemandRate: 20, onPrice: 0.1, offPrice: 0.1 }, bat(25, 25));
  const m = r.months[0];
  assert.ok(Math.abs(m.before.onKw - 40) < 1e-9);
  assert.ok(Math.abs(m.after.onKw - 15) < 0.05, String(m.after.onKw));
  assert.ok(Math.abs(r.demandSaving - 25 * 20 * 12) < 15, String(r.demandSaving));
});

test("joint caps: with both demand charges the search trades facility kW against on-peak kW", () => {
  const rows = month((d, q) => (q === 68 ? 40 : q === 12 ? 30 : 10));
  const a = analyze(rows, settings("10"));
  const load = a.months[0].list.map((p) => p.kw);
  const on = onPeakFlags(a.months[0].list.map((p) => p.t), tariff);
  const c = bestCaps(load, on, 0.25, bat(25, 25), 10, 20);
  // one spike a day each, 25 kW / 25 kWh recharged in between: both caps fall to the 15 kW the inverter allows
  assert.ok(greedyCaps(load, on, 0.25, c.capF, c.capP, bat(25, 25)).ok);
  assert.ok(c.capP <= 15.01 && c.capF <= 15.01, JSON.stringify(c));
});

test("the lowest on-peak cap is tight: feasible at it, infeasible just below", () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 10; k++) {
    const load = Array.from({ length: 192 }, () => 10 + rnd() * 40);
    const on = load.map((_, i) => (i % 96) >= 64 && (i % 96) < 84);
    const b = bat(5 + rnd() * 15, 10 + rnd() * 60, 0.8 + rnd() * 0.2);
    const c = bestCaps(load, on, 0.25, b, 0, 15);
    assert.ok(greedyCaps(load, on, 0.25, c.capF, c.capP, b).ok);
    const onMax = Math.max(...load.filter((_, i) => on[i]));
    if (c.capP > onMax - b.kw + 0.05) assert.ok(!greedyCaps(load, on, 0.25, c.capF, c.capP - 0.05, b).ok);
  }
});

test("dynamic programme never exports, respects the inverter, and ends refilled in cost", () => {
  const load = Array.from({ length: 96 * 3 }, (_, i) => 5 + (i % 7));
  const on = load.map((_, i) => (i % 96) >= 64 && (i % 96) < 84);
  const price = on.map((x) => (x ? 0.4 : 0.08));
  const b = bat(8, 30, 0.9);
  const { grid } = energyDP(load, on, price, 0.25, Infinity, Infinity, b);
  for (let i = 0; i < load.length; i++) {
    assert.ok(grid[i] >= -1e-9);
    assert.ok(Math.abs(grid[i] - load[i]) <= b.kw / Math.sqrt(0.9) + 1e-6);
  }
});

test("never worse than no battery, on random months with both charges and a ratchet", () => {
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const rows = [...month(() => 10 + rnd() * 50, 5), ...month(() => 10 + rnd() * 50, 6)];
  const a = analyze(rows, { ...settings("12"), ratchetPct: "70" });
  const r = touBattery(a, { ...tariff, facilityRate: undefined, onDemandRate: 8 }, bat(15, 30, 0.88));
  r.months.forEach((m) => assert.ok(m.after.total <= m.before.total + 1e-6, m.month));
  assert.ok(r.saving > 0);
});

test("monthBill splits on- and off-peak kWh", () => {
  const b = monthBill([10, 20, 30], [false, true, true], [0.1, 0.3, 0.3], 0.25, 5);
  assert.equal(b.facKw, 30); assert.equal(b.onKw, 30); assert.equal(b.onDemand, 150);
  assert.ok(Math.abs(b.offKwh - 2.5) < 1e-9 && Math.abs(b.onKwh - 12.5) < 1e-9);
  assert.ok(Math.abs(b.energy - (0.25 + 1.5 + 2.25)) < 1e-9);
});
