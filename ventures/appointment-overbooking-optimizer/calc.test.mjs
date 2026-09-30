import { test } from "node:test";
import assert from "node:assert/strict";
import { lgamma, bbPmf, fitBetaBinomial, evaluateBooking, bookingTable, parseRows, parseStatus, analyze, reportCsv, sampleText } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simulate slots whose show-up probability is 0.92 or 0.5 (a mixture, so no-shows cluster).
function simulate(n, seed, pGood = 0.92, pBad = 0.5, badShare = 0.3, size = 4) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const p = r() < badShare ? pBad : pGood;
    let k = 0;
    for (let j = 0; j < size; j++) if (r() < p) k++;
    return { key: `s${i}`, n: size, k };
  });
}

test("lgamma matches known values", () => {
  close(lgamma(5), Math.log(24), 1e-9);
  close(lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-9);
  close(lgamma(1), 0, 1e-9);
});

test("beta-binomial pmf sums to one and reduces to the binomial as correlation vanishes", () => {
  for (const [n, p, rho] of [[4, 0.8, 0.2], [6, 0.9, 0.05], [1, 0.5, 0.3]]) close(bbPmf(n, p, rho).reduce((a, b) => a + b, 0), 1, 1e-9);
  const pmf = bbPmf(2, 0.9, 1e-5);
  close(pmf[2], 0.81, 1e-4);
  close(pmf[1], 0.18, 1e-4);
  close(pmf[0], 0.01, 1e-4);
});

test("clustering fattens both tails: more all-show and more none-show slots than a binomial", () => {
  const flat = bbPmf(4, 0.8, 1e-5), clustered = bbPmf(4, 0.8, 0.3);
  assert.ok(clustered[4] > flat[4] || clustered[0] > flat[0]);
  assert.ok(clustered[0] > flat[0]);
  close(clustered.reduce((s, v, k) => s + v * k, 0), 4 * 0.8, 1e-9); // same mean
});

test("expected outcome of booking two into one seat matches a hand calculation", () => {
  const r = evaluateBooking(2, 1, 0.9, 1e-5, 100, 40);
  close(r.served, 0.99, 1e-3);
  close(r.overflow, 0.81, 1e-3);
  close(r.pOverflow, 0.81, 1e-3);
  close(r.profit, 100 * 0.99 - 40 * 0.81, 0.05);
  const base = evaluateBooking(1, 1, 0.9, 1e-5, 100, 40);
  close(base.profit, 90, 0.05);
  assert.equal(base.overflow, 0);
});

test("the fit recovers a clustered pattern and finds the plain rate when there is none", () => {
  const f = fitBetaBinomial(simulate(400, 1));
  close(f.p, 0.3 * 0.5 + 0.7 * 0.92, 0.03);
  assert.ok(f.rho > 0.1, `rho ${f.rho}`);
  assert.ok(f.ll > f.llBinomial + 5);
  const flat = fitBetaBinomial(simulate(400, 2, 0.85, 0.85));
  assert.ok(flat.rho < 0.05, `rho ${flat.rho}`);
  close(flat.p, 0.85, 0.03);
});

test("a higher overflow cost never raises the best booking level", () => {
  const rows = (oc) => bookingTable(2, 5, 0.8, 0.1, 100, oc);
  const argmax = (rs) => rs.reduce((b, r) => (r.profit > b.profit ? r : b)).booked;
  assert.ok(argmax(rows(300)) <= argmax(rows(20)));
  assert.equal(argmax(rows(100000)), 2);
});

test("status words: late cancels count as no-shows, early cancels are not counted", () => {
  assert.equal(parseStatus("Showed"), "show");
  assert.equal(parseStatus("No-Show"), "noshow");
  assert.equal(parseStatus("late cancel"), "noshow");
  assert.equal(parseStatus("Cancelled"), "cancelled");
  assert.equal(parseStatus("banana"), null);
});

test("per-appointment rows are grouped by slot", () => {
  const p = parseRows("slot,status\nmon-9,showed\nmon-9,no-show\nmon-9,showed\ntue-9,showed\ntue-9,cancelled\nfoo,???");
  const mon = p.groups.find((g) => g.key === "mon-9"), tue = p.groups.find((g) => g.key === "tue-9");
  assert.deepEqual([mon.n, mon.k], [3, 2]);
  assert.deepEqual([tue.n, tue.k], [1, 1]);
  assert.equal(p.warnings.length, 2);
});

test("per-slot counts parse, reorder by header name, and reject impossible rows", () => {
  const p = parseRows("showed,booked,slot\n3,4,a\n4,4,b\n5,4,c\n0,0,d");
  assert.equal(p.groups.length, 2);
  assert.deepEqual(p.groups.map((g) => [g.n, g.k]), [[4, 3], [4, 4]]);
  assert.match(p.warnings[0], /skipped/);
  const noHeader = parseRows("a,4,3\nb,4,4");
  assert.equal(noHeader.groups.length, 2);
  assert.match(parseRows("").error, /Paste or upload/);
  assert.match(parseRows("p,q,r\nq,r,s").error, /No usable rows/);
});

test("large groups trigger the group-by-session warning", () => {
  const rows = ["day,booked,showed", ...Array.from({ length: 20 }, (_, i) => `d${i},12,10`)].join("\n");
  assert.ok(parseRows(rows).warnings.some((w) => /groups are large/.test(w)));
});

test("refuses thin data rather than guessing", () => {
  const g = (n, k, m) => Array.from({ length: m }, (_, i) => ({ key: `s${i}`, n, k }));
  const o = { capacity: 2, margin: 100, overflowCost: 50 };
  assert.match(analyze(g(2, 2, 10), o).error, /appointments/);
  assert.match(analyze(g(2, 2, 40), o).error, /no-show/);
  assert.match(analyze(g(4, 3, 10), o).error, /slots/);
  assert.match(analyze(simulate(100, 3), { capacity: 2, margin: 0, overflowCost: 5 }).error, /earns you/);
  assert.match(analyze(simulate(100, 3), { capacity: 2, margin: 10, overflowCost: -1 }).error, /costs you/);
});

test("a full analysis on clustered data overbooks by one and reports honest ranges", () => {
  const r = analyze(simulate(200, 5, 0.9, 0.5, 0.3, 4), { capacity: 3, margin: 90, overflowCost: 25 });
  assert.ok(!r.error);
  assert.equal(r.best.booked, 4);
  assert.ok(r.gain > 0);
  assert.ok(r.gainRange80[0] <= r.gain + 1e-9 && r.gainRange80[1] >= r.gainRange80[0]);
  assert.ok(r.rateRange80[0] < r.noShowRate && r.noShowRate < r.rateRange80[1]);
  assert.ok(r.rho > 0.05);
  assert.equal(r.rows[0].booked, 3);
  assert.equal(r.rows.length, 5);
  close(r.share.reduce((s, x) => s + x.share, 0), 1, 1e-9);
  assert.ok(r.holdout && r.holdout.stable);
});

test("when an extra no-show is cheap to lose and overflow is ruinous, it says do not overbook", () => {
  const r = analyze(simulate(200, 6), { capacity: 3, margin: 20, overflowCost: 500 });
  assert.equal(r.best.booked, 3);
  assert.equal(r.gain, 0);
});

test("a cap on the chance of turning someone away is respected", () => {
  const free = analyze(simulate(200, 7, 0.8, 0.45), { capacity: 2, margin: 100, overflowCost: 10, maxExtra: 5 });
  const capped = analyze(simulate(200, 7, 0.8, 0.45), { capacity: 2, margin: 100, overflowCost: 10, maxExtra: 5, maxOverflow: 0.1 });
  assert.ok(free.best.booked > capped.best.booked);
  assert.ok(capped.best.pOverflow <= 0.1 + 1e-9);
});

test("analysis is reproducible: same input, same ranges", () => {
  const o = { capacity: 3, margin: 90, overflowCost: 25 };
  const a = analyze(simulate(150, 8), o), b = analyze(simulate(150, 8), o);
  assert.deepEqual(a.gainRange80, b.gainRange80);
  assert.deepEqual(a.share, b.share);
});

test("a recent change in the no-show rate is flagged as drift", () => {
  const early = simulate(90, 9, 0.93, 0.93, 0, 4), late = simulate(30, 10, 0.55, 0.55, 0, 4);
  const r = analyze([...early, ...late.map((g, i) => ({ ...g, key: `late${i}` }))], { capacity: 3, margin: 90, overflowCost: 25 });
  assert.equal(r.verdict, "drifting");
  assert.ok(r.warnings.some((w) => /moved/.test(w)));
});

test("the sample loads, analyses, and exports a CSV", () => {
  const p = parseRows(sampleText());
  assert.equal(p.groups.length, 120);
  const r = analyze(p.groups, { capacity: 3, margin: 90, overflowCost: 25 });
  assert.ok(!r.error);
  assert.equal(r.best.booked, 4);
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, 1 + r.rows.length);
  assert.match(csv[0], /^booked,expected_served/);
});
