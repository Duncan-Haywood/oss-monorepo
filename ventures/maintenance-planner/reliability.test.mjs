import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitWeibull, weibullLogLik, ageReplacement, gamma, readShape, assetReliability } from "./reliability.mjs";
import { parseDay } from "./schedule.mjs";

// Lieblein and Zelen (1956): millions of revolutions to failure of 23 ball
// bearings. Published maximum-likelihood fit (Lawless, Statistical Models and
// Methods for Lifetime Data): shape 2.102, scale 81.88.
const BEARINGS = [17.88, 28.92, 33.0, 41.52, 42.12, 45.6, 48.48, 51.84, 51.96, 54.12, 55.56, 67.8, 68.64, 68.64, 68.88, 84.12, 93.12, 98.64, 105.12, 105.84, 127.92, 128.04, 173.4];

test("Weibull fit reproduces the published bearing-data MLE", () => {
  const f = fitWeibull(BEARINGS);
  assert.ok(Math.abs(f.shape - 2.102) < 0.001, f.shape);
  assert.ok(Math.abs(f.scale - 81.88) < 0.01, f.scale);
  assert.ok(f.shapeCI[0] < f.shape && f.shape < f.shapeCI[1]);
});

test("censored fits match scipy's weibull_min.fit(CensoredData) (eval/weibull-vs-scipy.py)", () => {
  const ref = JSON.parse(readFileSync(new URL("./eval/weibull-vs-scipy.json", import.meta.url), "utf8"));
  for (const [name, [shape, scale, f, c]] of Object.entries(ref)) {
    const r = fitWeibull(f, c);
    assert.ok(Math.abs(r.shape / shape - 1) < 1e-4, `${name} shape ${r.shape} vs ${shape}`);
    assert.ok(Math.abs(r.scale / scale - 1) < 1e-4, `${name} scale ${r.scale} vs ${scale}`);
  }
});

test("the fit is the likelihood maximum on a grid (independent check)", () => {
  const f = [120, 340, 560, 610, 890], c = [400, 1000, 1000];
  const r = fitWeibull(f, c);
  let best = -Infinity;
  for (let b = 0.5; b <= 4; b += 0.01) for (let e = 300; e <= 2000; e += 2) best = Math.max(best, weibullLogLik(b, e, f, c));
  assert.ok(r.logLik >= best - 1e-9);
  assert.ok(r.logLik - best < 0.01);
});

test("large hour counts do not overflow", () => {
  const r = fitWeibull([35000, 41000, 39000, 44000], [12000]);
  assert.ok(Number.isFinite(r.shape) && Number.isFinite(r.scale) && r.shape > 1);
});

test("fewer than two failures gives no fit; equal times give no finite shape", () => {
  assert.equal(fitWeibull([100]), null);
  assert.equal(fitWeibull([100, 100, 100]), null);
});

test("gamma function", () => {
  assert.ok(Math.abs(gamma(5) - 24) < 1e-10);
  assert.ok(Math.abs(gamma(0.5) - Math.sqrt(Math.PI)) < 1e-12);
});

test("the shape reading needs the whole interval on one side of 1", () => {
  assert.equal(readShape({ shape: 2, shapeCI: [1.2, 3], level: 0.9 }).pattern, "wear-out");
  assert.equal(readShape({ shape: 0.6, shapeCI: [0.4, 0.9], level: 0.9 }).pattern, "early-life");
  assert.equal(readShape({ shape: 1.8, shapeCI: [0.7, 3], level: 0.9 }).pattern, "no clear age pattern");
});

test("age replacement: matches a brute-force minimum and refuses when it cannot help", () => {
  const b = 2.5, e = 1000, cp = 1, cf = 10;
  const r = ageReplacement(b, e, cp, cf);
  // brute force with a fine trapezoid integral
  const R = (t) => Math.exp(-((t / e) ** b));
  let bestT = 0, bestC = Infinity;
  for (let T = 10; T <= 3000; T += 1) {
    let I = 0; const h = T / 2000;
    for (let i = 0; i < 2000; i++) I += (R(i * h) + R((i + 1) * h)) * h / 2;
    const C = (cp * R(T) + cf * (1 - R(T))) / I;
    if (C < bestC) { bestC = C; bestT = T; }
  }
  assert.ok(Math.abs(r.optimal - bestT) <= 3, `${r.optimal} vs ${bestT}`);
  assert.ok(Math.abs(r.costRate / bestC - 1) < 1e-4);
  assert.ok(Math.abs(r.runToFailure - cf / (e * gamma(1 + 1 / b))) < 1e-12);
  assert.equal(ageReplacement(0.9, e, cp, cf).optimal, null);
  assert.equal(ageReplacement(3, e, 10, 10).optimal, null);
});

test("asset history: censored time since the last failure, causes read apart", () => {
  const today = parseDay("2026-01-01");
  const asset = { id: "A", inService: "2025-01-01" };
  const wos = [
    { assetId: "A", failure: true, created: "2025-03-01", completed: "2025-03-01", status: "done", downtimeHours: 4, failureCode: "belt" },
    { assetId: "A", failure: true, created: "2025-06-01", completed: "2025-06-01", status: "done", downtimeHours: 2, failureCode: "sensor" },
    { assetId: "A", failure: true, created: "2025-10-01", completed: "2025-10-02", status: "done", downtimeHours: 6, failureCode: "belt" },
    { assetId: "B", failure: true, created: "2025-05-01", completed: "2025-05-01", status: "done", downtimeHours: 9 },
  ];
  const r = assetReliability(asset, wos, today);
  assert.deepEqual(r.times, [59, 92, 122]);
  assert.deepEqual(r.censored, [92]);
  assert.equal(r.mttr, 4);
  assert.equal(r.unit, "days");
  assert.equal(r.mtbf, 365 / 3);
  assert.ok(Math.abs(r.availability - (1 - 12 / (365 * 24))) < 1e-12);
  assert.equal(r.causes, 2);
  assert.match(r.reading.pattern, /mixed causes/);
  const belt = assetReliability(asset, wos, today, { mode: "belt" });
  assert.deepEqual(belt.times, [59, 214]);
  assert.deepEqual(belt.censored, [92]);
});

test("asset history uses meter hours when the asset has a meter", () => {
  const asset = { id: "C", inService: "2025-01-01", meterUnit: "hours", meterStart: 0, readings: [{ date: "2025-01-01", value: 0 }, { date: "2025-12-31", value: 3640 }] };
  const wos = [{ assetId: "C", failure: true, created: "2025-07-01", status: "done", meter: 1800 }];
  const r = assetReliability(asset, wos, parseDay("2025-12-31"));
  assert.equal(r.unit, "hours");
  assert.deepEqual(r.times, [1800]);
  assert.deepEqual(r.censored, [1840]);
});
