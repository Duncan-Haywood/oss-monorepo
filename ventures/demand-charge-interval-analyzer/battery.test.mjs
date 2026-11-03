import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./calc.mjs";
import { holdCap, lowestCap, dispatchSavings, sizeSweep } from "./battery.mjs";

const bat = (kw, kwh, roundTrip = 1) => ({ kw, kwh, roundTrip });

test("a one-interval spike is shaved by exactly the inverter power when energy suffices", () => {
  const s = Array(96).fill(10); s[50] = 60;
  const cap = lowestCap(s, 0.25, bat(20, 100));
  assert.ok(Math.abs(cap - 40) < 0.01);
});

test("energy limits the cap: a 4 h plateau needs kWh, not just kW", () => {
  const s = Array(96).fill(10); for (let i = 40; i < 56; i++) s[i] = 50; // 4 h at 50 kW
  // 20 kW over 4 h = 80 kWh; a 40 kWh battery can only cut 10 kW
  const cap = lowestCap(s, 0.25, bat(20, 40));
  assert.ok(Math.abs(cap - 40) < 0.02, String(cap));
});

test("lowest cap is tight: feasible at the cap, infeasible just below", () => {
  let seed = 3; const r = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 20; k++) {
    const s = Array.from({ length: 192 }, () => 10 + r() * 40);
    const b = bat(5 + r() * 15, 10 + r() * 60, 0.8 + r() * 0.2);
    const cap = lowestCap(s, 0.25, b);
    assert.ok(holdCap(s, 0.25, cap, b).ok);
    if (cap > Math.max(...s) - b.kw + 0.05) assert.ok(!holdCap(s, 0.25, cap - 0.05, b).ok);
  }
});

test("losses: lower round trip never gives a lower cap, and charging is accounted", () => {
  const s = Array(96).fill(10); for (let i = 40; i < 48; i++) s[i] = 40;
  assert.ok(lowestCap(s, 0.25, bat(20, 30, 0.7)) >= lowestCap(s, 0.25, bat(20, 30, 1)) - 1e-9);
  const res = holdCap(s, 0.25, 30, bat(20, 30, 0.81));
  assert.ok(res.chargedKwh >= res.dischargedKwh);
});

function year(peak) {
  const rows = [];
  for (let mo = 1; mo <= 12; mo++) {
    const days = new Date(Date.UTC(2026, mo, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) for (let q = 0; q < 96; q++)
      rows.push({ t: Date.UTC(2026, mo - 1, d, Math.floor(q / 4), (q % 4) * 15), v: d === 10 && q === 56 ? peak : 10 });
  }
  return rows;
}
const settings = { unit: "kw", intervalMin: "", demandRate: "10", ratchetPct: "", usablePct: "" };

test("saving over a year equals shaved kW x rate x 12 with no ratchet", () => {
  const a = analyze(year(60), settings);
  const r = dispatchSavings(a, bat(20, 50), 0);
  assert.ok(Math.abs(r.demandSaving - 20 * 10 * 12) < 1);
});

test("a ratchet carries the saving: shaving one month still lowers later floors", () => {
  const rows = year(60);
  const a = analyze(rows, { ...settings, ratchetPct: "80" });
  const r = dispatchSavings(a, bat(20, 50), 0);
  assert.ok(r.demandSaving > 0);
  r.months.forEach((m) => assert.ok(m.billedAfter <= m.billedBefore + 1e-9));
});

test("efficiency loss cost is charged against the saving", () => {
  const a = analyze(year(60), settings);
  const r0 = dispatchSavings(a, bat(20, 50, 0.8), 0);
  const r1 = dispatchSavings(a, bat(20, 50, 0.8), 0.2);
  assert.ok(r1.lossCost > 0 && r1.saving < r0.saving);
});

test("sizeSweep prices sizes and picks the quickest payback", () => {
  const a = analyze(year(60), settings);
  const s = sizeSweep(a, { perKwh: 500, perKw: 200 });
  assert.equal(s.rows.length, 20);
  assert.ok(s.best && s.best.payback > 0);
  assert.ok(s.rows.every((r) => r.saving <= a.maxPeak * 10 * 12 + 1));
});
