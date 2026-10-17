import { test } from "node:test";
import assert from "node:assert/strict";
import { lnGamma, showsPmf, evaluatePlan, parseHistory, analyzeRate, analyzeHistory, reportCsv, sampleText } from "./calc.mjs";

const base = { capacity: 10, revenue: 150, variableCost: 0, overflowCost: 100, daysPerYear: 250 };

// Independent reference: binomial by Pascal's triangle, no log-gamma.
function binomRef(n, p) {
  let row = [1];
  for (let i = 1; i <= n; i++) { const nx = [1]; for (let j = 1; j < i; j++) nx.push(row[j - 1] + row[j]); nx.push(1); row = nx; }
  return row.map((c, s) => c * p ** s * (1 - p) ** (n - s));
}

test("lnGamma matches known factorials", () => {
  assert.ok(Math.abs(lnGamma(1) - 0) < 1e-10);
  assert.ok(Math.abs(lnGamma(6) - Math.log(120)) < 1e-10);
  assert.ok(Math.abs(lnGamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-10);
});

test("binomial pmf matches an independent reference and sums to 1", () => {
  const pmf = showsPmf(13, 0.85), ref = binomRef(13, 0.85);
  pmf.forEach((v, i) => assert.ok(Math.abs(v - ref[i]) < 1e-12, `s=${i}`));
  assert.ok(Math.abs(pmf.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test("beta-binomial keeps the mean and inflates variance by 1 + (n-1)rho", () => {
  const n = 14, p = 0.8, rho = 0.1;
  const pmf = showsPmf(n, p, rho);
  const mean = pmf.reduce((a, v, s) => a + s * v, 0);
  const vr = pmf.reduce((a, v, s) => a + (s - mean) ** 2 * v, 0);
  assert.ok(Math.abs(mean - n * p) < 1e-9);
  assert.ok(Math.abs(vr - n * p * (1 - p) * (1 + (n - 1) * rho)) < 1e-9);
});

test("evaluatePlan: no overbooking and a sure show rate gives plain margin", () => {
  const e = evaluatePlan({ capacity: 10, booked: 10, p: 1, margin: 150, overflowCost: 100 });
  assert.equal(e.profit, 1500);
  assert.equal(e.expectedOver, 0);
  assert.equal(e.pOver, 0);
});

test("evaluatePlan: bump vs overtime differ exactly by revenue on the overflow", () => {
  const args = { capacity: 10, booked: 12, p: 0.9, margin: 150, overflowCost: 100 };
  const bump = evaluatePlan({ ...args, mode: "bump" }), ot = evaluatePlan({ ...args, mode: "overtime" });
  assert.ok(Math.abs(ot.profit - bump.profit - 150 * bump.expectedOver) < 1e-9);
});

test("optimal extra bookings equals a brute-force scan of the reference binomial", () => {
  const r = analyzeRate({ ...base, noShowRate: 0.15, rho: 0 });
  let best = 0, bestP = -Infinity;
  for (let k = 0; k <= 8; k++) {
    const ref = binomRef(10 + k, 0.85);
    let prof = 0;
    ref.forEach((pr, s) => { prof += pr * (150 * Math.min(s, 10) - 100 * Math.max(s - 10, 0)); });
    if (prof > bestP + 1e-9) { bestP = prof; best = k; }
  }
  assert.equal(r.best.extra, best);
  assert.ok(Math.abs(r.best.profit - bestP) < 1e-6);
  assert.ok(best >= 1, "a 15% no-show rate should justify at least one extra booking");
});

test("more no-shows means more overbooking, costlier overflow means less", () => {
  const k = (ns, c) => analyzeRate({ ...base, noShowRate: ns, overflowCost: c, rho: 0 }).best.extra;
  assert.ok(k(0.3, 100) > k(0.1, 100));
  assert.ok(k(0.15, 5000) <= k(0.15, 100));
  assert.equal(k(0.15, 1e6), 0);
  assert.equal(k(0.0, 100), 0);
});

test("clustered days lower the profit-optimal plan or leave it, never raise expected gain", () => {
  const a = analyzeRate({ ...base, noShowRate: 0.15, rho: 0 });
  const b = analyzeRate({ ...base, noShowRate: 0.15, rho: 0.15 });
  assert.ok(b.best.extra <= a.best.extra + 1);
  assert.ok(b.gainPerDay <= a.gainPerDay + 1e-9);
  assert.equal(a.sensitivity.length, 4);
});

test("probability cap picks the largest plan inside it", () => {
  const r = analyzeRate({ ...base, noShowRate: 0.2, rho: 0, maxOverflowProb: 0.1 });
  assert.ok(r.capped.pOver <= 0.1 + 1e-12);
  const next = r.plans[r.capped.extra + 1];
  if (next) assert.ok(next.pOver > 0.1);
});

test("inputs are validated with plain messages", () => {
  assert.match(analyzeRate({ ...base, capacity: 0, noShowRate: 0.1 }).error, /Slots per day/);
  assert.match(analyzeRate({ ...base, noShowRate: 1 }).error, /No-show rate/);
  assert.match(analyzeRate({ ...base, variableCost: 200, noShowRate: 0.1 }).error, /below the revenue/);
  assert.match(analyzeRate({ ...base, overflowCost: -1, noShowRate: 0.1 }).error, /Cost of a patient/);
});

test("parseHistory reads 2 and 3 column rows, rejects reversed columns", () => {
  const a = parseHistory("booked,showed\n12,10\n12,11\n"), b = parseHistory("2026-01-05,12,10\n2026-01-06,12,11");
  assert.equal(a.rows.length, 2);
  assert.equal(b.rows[1].showed, 11);
  assert.match(a.warnings[0], /skipped/);
  assert.match(parseHistory("10,12").error, /cannot exceed booked/);
  assert.match(parseHistory("").error, /Paste/);
});

// Seeded generator of clustered days for round-trip checks.
function gen(days, booked, p, spread, seed) {
  let a = seed;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rows = [];
  for (let d = 0; d < days; d++) {
    const pd = Math.min(0.99, Math.max(0.3, p + (rnd() - 0.5) * 2 * spread));
    let s = 0; for (let i = 0; i < booked; i++) if (rnd() < pd) s++;
    rows.push({ date: null, booked, showed: s });
  }
  return rows;
}

test("history mode recovers the show rate and detects clustering", () => {
  const clustered = analyzeHistory(gen(400, 12, 0.85, 0.12, 7), base);
  assert.ok(Math.abs(clustered.p - 0.85) < 0.02, String(clustered.p));
  assert.ok(clustered.rho > 0.03, `rho ${clustered.rho}`);
  const indep = analyzeHistory(gen(400, 12, 0.85, 0, 9), base);
  assert.ok(indep.rho < 0.02, `rho ${indep.rho}`);
  assert.ok(clustered.noShowRange80[0] < clustered.noShowRate && clustered.noShowRate < clustered.noShowRange80[1]);
});

test("less data widens the no-show range", () => {
  const big = analyzeHistory(gen(300, 12, 0.85, 0.05, 3), base), small = analyzeHistory(gen(12, 12, 0.85, 0.05, 3), base);
  assert.ok(small.noShowRange80[1] - small.noShowRange80[0] > big.noShowRange80[1] - big.noShowRange80[0]);
});

test("history mode refuses too little data and nonsense", () => {
  assert.match(analyzeHistory(gen(5, 12, 0.85, 0, 1), base).error, /at least 10 days/);
  assert.match(analyzeHistory(gen(30, 12, 0, 0, 1).map((r) => ({ ...r, showed: 0 })), base).error, /Nobody showed/);
});

test("hold-out reports coverage near its 80% target on well-behaved data", () => {
  const r = analyzeHistory(gen(400, 12, 0.85, 0.12, 11), base);
  assert.ok(r.holdout.coverage80 >= 0.65 && r.holdout.coverage80 <= 0.97, String(r.holdout.coverage80));
  assert.ok(r.holdout.clusteringHelps, "clustered data should score better under the beta-binomial");
});

test("the bundled example parses, analyses, and exports a scan", () => {
  const p = parseHistory(sampleText());
  assert.equal(p.rows.length, 60);
  const r = analyzeHistory(p.rows, { ...base, capacity: 12 });
  assert.ok(!r.error);
  assert.ok(r.best.extra >= 1);
  const csv = reportCsv(r);
  assert.equal(csv.trim().split("\n").length, r.plans.length + 1);
  assert.equal(sampleText(), sampleText());
});

test("results are deterministic", () => {
  const rows = gen(60, 12, 0.85, 0.1, 5);
  assert.deepEqual(analyzeHistory(rows, base).best, analyzeHistory(rows, base).best);
});
