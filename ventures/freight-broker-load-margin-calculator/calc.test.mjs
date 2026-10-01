import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoads, analyzeLoad, analyze, sampleLoads, loadsCsv, DEFAULTS } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const one = (line, s = {}) => analyze(parseLoads(line).loads, s).results[0];

test("gross profit and margin are revenue less carrier cost, extras included", () => {
  const r = one("A, 2000, 1700, 500, 100, 50", { financingAprPct: 0, reservePct: 0 });
  assert.equal(r.revenue, 2100);
  assert.equal(r.carrierCost, 1750);
  assert.equal(r.gross, 350);
  close(r.grossMargin, (350 / 2100) * 100);
  assert.equal(r.net, 350);
});

test("financing charges the carrier cost for the days between paying out and collecting", () => {
  const r = one("A, 2000, 1800, 0, 0, 0, 33, 3", { financingAprPct: 12, reservePct: 0 });
  assert.equal(r.gapDays, 30);
  close(r.financing, 1800 * 0.12 * 30 / 365, 1e-9);
  close(r.net, 200 - r.financing, 1e-9);
});

test("a carrier paid after the shipper costs nothing to carry", () => {
  const r = one("A, 2000, 1800, 0, 0, 0, 10, 20", { reservePct: 0 });
  assert.equal(r.gapDays, 0);
  assert.equal(r.financing, 0);
});

test("factoring, reserve, commission and overhead each come off the net", () => {
  const r = one("A, 1000, 800, 0, 0, 0, 3, 3", { factoringPct: 2, reservePct: 1, commissionPct: 25, overheadPerLoad: 20, financingAprPct: 0 });
  close(r.factoring, 20); close(r.reserve, 10); close(r.commission, 50);
  close(r.net, 200 - 20 - 10 - 50 - 20);
});

test("quoting the minimum shipper rate lands exactly on the target margin", () => {
  const s = { targetMarginPct: 12, financingAprPct: 15, factoringPct: 1.5, reservePct: 1, commissionPct: 20, overheadPerLoad: 35 };
  const l = parseLoads("A, 2000, 1900, 600, 120, 60, 45, 3").loads[0];
  const o = { ...DEFAULTS, ...s };
  const first = analyzeLoad(l, o);
  const requoted = analyzeLoad({ ...l, shipperRate: first.minShipperRate }, o);
  close(requoted.netMargin, 12, 1e-6);
});

test("paying the maximum carrier rate lands exactly on the target margin", () => {
  const s = { targetMarginPct: 8, financingAprPct: 10, reservePct: 0.5, commissionPct: 10, overheadPerLoad: 25 };
  const l = parseLoads("A, 3000, 2800, 900, 0, 40, 60, 2").loads[0];
  const o = { ...DEFAULTS, ...s };
  const first = analyzeLoad(l, o);
  const repaid = analyzeLoad({ ...l, carrierRate: first.maxCarrierRate }, o);
  close(repaid.netMargin, 8, 1e-6);
});

test("break-even shipper rate gives zero net", () => {
  const o = { ...DEFAULTS, overheadPerLoad: 40 };
  const l = parseLoads("A, 1500, 1450, 400, 0, 0, 45").loads[0];
  const first = analyzeLoad(l, o);
  close(analyzeLoad({ ...l, shipperRate: first.breakEvenShipperRate }, o).net, 0, 1e-6);
});

test("a load positive on gross but negative on net is called out", () => {
  const r = one("Slow, 1000, 960, 300, 0, 0, 90, 2", { overheadPerLoad: 30 });
  assert.ok(r.gross > 0 && r.net < 0);
  assert.ok(r.flags.some((f) => /positive but net is/.test(f)));
});

test("a load under target is flagged with the requote", () => {
  const r = one("Thin, 1000, 930, 300, 0, 0, 30, 3", { targetMarginPct: 10 });
  assert.ok(r.net > 0 && r.netMargin < 10);
  assert.ok(r.flags.some((f) => /under your 10\.0% target/.test(f)));
});

test("per-mile figures appear only with miles", () => {
  const withMiles = one("A, 1000, 800, 500");
  close(withMiles.shipperPerMile, 2); close(withMiles.carrierPerMile, 1.6);
  const without = one("A, 1000, 800");
  assert.equal(without.shipperPerMile, undefined);
});

test("book totals add up and name the best and worst load", () => {
  const r = analyze(parseLoads(sampleLoads()).loads);
  assert.equal(r.totals.loads, 5);
  close(r.totals.net, r.results.reduce((a, x) => a + x.net, 0));
  close(r.totals.leak, r.totals.financing + r.totals.factoring + r.totals.reserve + r.totals.commission + r.totals.overhead, 1e-6);
  assert.ok(r.totals.losing + r.totals.belowTarget >= 1);
  assert.ok(r.best && r.worst && r.best !== r.worst);
});

test("parser reports line numbers for bad rows and skips comments and headers", () => {
  const p = parseLoads("load,shipper,carrier\n# note\nA, 1000\nB, abc, 5\nC, 1000, 900");
  assert.equal(p.loads.length, 1);
  assert.equal(p.errors.length, 2);
  assert.match(p.errors[0], /^Line 3/);
  assert.match(p.errors[1], /^Line 4/);
});

test("out-of-range settings are rejected, empty input is rejected", () => {
  assert.match(analyze(parseLoads("A,1000,900").loads, { targetMarginPct: 70 }).error, /out of range/);
  assert.match(analyze(parseLoads("A,1000,900").loads, { reservePct: -1 }).error, /0 or more/);
  assert.match(analyze([]).error, /at least one/);
});

test("CSV quotes names with commas and has one row per load", () => {
  const r = analyze(parseLoads('"Dallas, TX to ATL", 2650, 2250').loads);
  const lines = loadsCsv(r).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('"Dallas, TX to ATL",'));
});
