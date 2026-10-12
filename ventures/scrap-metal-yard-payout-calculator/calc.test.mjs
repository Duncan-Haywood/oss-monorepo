import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, validateInput, stripAnalysis, sampleInput, resultText, resultCsv, serializeState, parseState, lotLb, lotPriceLb } from "./calc.mjs";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function load(rand) {
  const u = (lo, hi) => lo + rand() * (hi - lo);
  const n = 1 + Math.floor(rand() * 8);
  const lots = Array.from({ length: n }, (_, k) => ({ name: `lot ${k}`, weight: u(1, 900), weightUnit: ["lb", "kg", "ton"][Math.floor(rand() * 3)], priceA: u(0.1, 4), priceB: u(0.1, 4), priceUnit: "lb" }));
  return { ...sampleInput(), lots, yardA: { name: "A", oneWayMiles: u(1, 40), minutes: u(20, 120), fee: u(0, 20), deductPct: u(0, 10) }, yardB: { name: "B", oneWayMiles: u(1, 40), minutes: u(20, 120), fee: u(0, 20), deductPct: u(0, 10) }, perMile: u(0.3, 1), hourly: u(0, 60) };
}

test("worked example recomputed by hand", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  const grossA = 85 * 3.55 + 140 * 0.52 + 60 * 1.95 + 120 * 0.62 + 1800 * (210 / 2000);
  const grossB = 85 * 3.7 + 140 * 0.48 + 60 * 2.05 + 120 * 0.55 + 1800 * (190 / 2000);
  close(r.grossA, grossA);
  close(r.grossB, grossB);
  const tripA = 18 * 0.7 + (55 / 60) * 25;
  const tripB = 44 * 0.7 + (85 / 60) * 25 + 5;
  close(r.tripA.total, tripA);
  close(r.tripB.total, tripB);
  close(r.netA, grossA - tripA);
  close(r.netB, grossB - tripB);
  assert.equal(r.best.key, "A");
});

test("unit conversion: kg, short ton and long ton", () => {
  close(lotLb({ weight: 100, weightUnit: "kg" }), 220.46226218);
  close(lotLb({ weight: 2, weightUnit: "ton" }), 4000);
  close(lotPriceLb(2240, { priceUnit: "longton" }), 1);
  close(lotPriceLb(2000, { priceUnit: "ton" }), 1);
  close(lotPriceLb(1, { priceUnit: "kg" }), 1 / 2.2046226218);
});

test("the best option is never beaten by another option (random loads)", () => {
  const rand = rng(7);
  for (let k = 0; k < 400; k++) {
    const r = solve(load(rand));
    assert.ok(r.ok);
    for (const o of r.options) assert.ok(r.best.net >= o.net - 1e-9);
  }
});

test("a lot goes to the yard that pays more per lot, and split pays both trips", () => {
  const i = sampleInput();
  i.yardA.oneWayMiles = 0; i.yardA.minutes = 0; i.yardB.oneWayMiles = 0; i.yardB.minutes = 0; i.yardB.fee = 0;
  const r = solve(i);
  assert.equal(r.best.key, "split");
  const expected = r.rows.reduce((s, x) => s + Math.max(x.grossA, x.grossB), 0);
  close(r.netSplit, expected);
  assert.deepEqual(r.splitLots.toB, ["#2 copper tubing", "Yellow brass"]);
  const j = sampleInput();
  j.yardA.minutes = 600;
  const rj = solve(j);
  const sp = rj.options.find((o) => o.key === "split");
  close(sp.cost, rj.tripA.total + rj.tripB.total);
});

test("split is withheld when every lot pays more at one yard", () => {
  const i = sampleInput();
  i.lots.forEach((l) => { l.priceA = l.priceB + 1; });
  const r = solve(i);
  assert.equal(r.options.length, 2);
  assert.equal(r.netSplit, null);
});

test("catch-up factor makes the other yard tie the best single yard when applied", () => {
  const rand = rng(11);
  for (let k = 0; k < 300; k++) {
    const i = load(rand);
    const r = solve(i);
    if (r.catchUp.factor === null) continue;
    const j = structuredClone(i);
    const key = r.catchUp.yard === "A" ? "priceA" : "priceB";
    j.lots.forEach((l) => { l[key] *= r.catchUp.factor; });
    const r2 = solve(j);
    const t = r.catchUp.yard === "A" ? r2.netA : r2.netB;
    close(t, Math.max(r.netA, r.netB), 1e-7);
  }
});

test("price sensitivity scales gross but not trip cost", () => {
  const r = solve(sampleInput());
  close(r.sensitivity[0].netA, r.grossA * 0.9 - r.tripA.total);
  close(r.sensitivity[1].netB, r.grossB * 0.8 - r.tripB.total);
});

test("grading deduction reduces that yard's gross only", () => {
  const i = sampleInput();
  const base = solve(i);
  i.yardA.deductPct = 10;
  const r = solve(i);
  close(r.grossA, base.grossA * 0.9);
  close(r.grossB, base.grossB);
});

test("wire stripping: gain, breakeven recovery and hourly figure", () => {
  const i = sampleInput();
  const s = stripAnalysis(i);
  close(s.sellInsulated, 66);
  close(s.sellBare, 33 * 3.55);
  close(s.gain, 33 * 3.55 - 66 - 1.5 * 25);
  assert.ok(s.strips);
  const j = structuredClone(i);
  j.strip.recoveryPct = s.breakevenRecoveryPct;
  close(stripAnalysis(j).gain, 0, 1e-9);
  const rand = rng(3);
  for (let k = 0; k < 200; k++) {
    const x = load(rand);
    x.strip = { weightLb: 5 + rand() * 500, insulatedPrice: rand() * 2, bareCopperPrice: 1 + rand() * 4, recoveryPct: 20 + rand() * 70, minutesPerLb: rand() * 4 };
    const a = stripAnalysis(x);
    const y = structuredClone(x); y.strip.recoveryPct = a.breakevenRecoveryPct;
    if (a.breakevenRecoveryPct <= 100) close(stripAnalysis(y).gain, 0, 1e-8);
    assert.equal(a.strips, a.gain > 0.005);
  }
});

test("validation rejects bad input", () => {
  const bad = (f) => { const i = sampleInput(); f(i); return validateInput(i); };
  assert.ok(bad((i) => { i.lots = []; }).length);
  assert.ok(bad((i) => { i.lots.forEach((l) => { l.weight = 0; }); }).length);
  assert.ok(bad((i) => { i.lots[0].weight = -1; }).length);
  assert.ok(bad((i) => { i.lots[0].priceUnit = "stone"; }).length);
  assert.ok(bad((i) => { i.lots[0].priceA = NaN; }).length);
  assert.ok(bad((i) => { i.yardA.deductPct = 101; }).length);
  assert.ok(bad((i) => { i.perMile = -1; }).length);
  assert.ok(bad((i) => { i.strip.recoveryPct = 120; }).length);
  assert.ok(bad((i) => { i.lots = Array(9).fill(i.lots[0]); }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve(null).ok, false);
});

test("a load that cannot cover the trip says so", () => {
  const i = sampleInput();
  i.lots = [{ name: "can", weight: 2, weightUnit: "lb", priceA: 0.5, priceB: 0.5, priceUnit: "lb" }];
  const r = solve(i);
  assert.ok(r.best.net < 0);
  assert.match(r.notes[0], /does not cover the trip/);
});

test("exports and saved scenarios round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Best: All at Yard A/);
  assert.match(resultCsv(r), /best_net,/);
  assert.match(resultCsv(r), /"#2 copper tubing",85\.00/);
  const back = parseState(serializeState(sampleInput()));
  assert.deepEqual(back.state, sampleInput());
  assert.ok(parseState("{").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
});
