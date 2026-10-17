import { test } from "node:test";
import assert from "node:assert/strict";
import { equityByYear, offerYears, baseToMatch, analyze, sampleInput, reportCsv, parseNum, MAX_OFFERS } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const O = { base: 100000, bonusPct: 0.1, signOn: 10000, equityGrant: 200000, vestYears: 4, growth: 0, confidence: 1, refresh: 0, matchPct: 0.04, matchCap: Infinity, other: 1000, taxRate: 0.3 };

test("equity vests in even yearly slices over the vesting years", () => {
  assert.deepEqual(equityByYear(200000, 4, 0, 1), [50000, 50000, 50000, 50000]);
  assert.deepEqual(equityByYear(100, 2, 0, 1), [50, 50, 0, 0]);
  assert.deepEqual(equityByYear(100, 1, 0, 1), [100, 0, 0, 0]);
});

test("growth compounds by plan year and confidence scales the value", () => {
  const e = equityByYear(400, 4, 0.1, 0.5);
  near(e[0], 50);
  near(e[1], 55);
  near(e[3], 100 * 1.331 * 0.5);
});

test("a year's total adds every component; sign-on is year one only", () => {
  const y = offerYears(O);
  near(y[0].total, 100000 + 10000 + 10000 + 4000 + 1000 + 50000);
  near(y[1].total, 100000 + 10000 + 4000 + 1000 + 50000);
  near(y[0].afterTax, y[0].total * 0.7);
});

test("match cap limits the employer match; refresh starts in year two", () => {
  const y = offerYears({ ...O, matchCap: 2000, refresh: 20000, confidence: 0.5 });
  near(y[0].match, 2000);
  near(y[0].equity, 25000);
  near(y[1].equity, 25000 + 10000);
});

test("baseToMatch finds the base whose four-year average equals the target", () => {
  const target = 200000;
  const base = baseToMatch(O, target);
  const avg = offerYears({ ...O, base }).reduce((a, r) => a + r.total, 0) / 4;
  near(avg, target, 0.5);
  assert.equal(baseToMatch(O, 1), O.base);
});

test("sample: the offer with equity confidence and refresh ranks first, hourly can rank differently", () => {
  const a = analyze(sampleInput());
  assert.equal(a.results.length, 3);
  assert.equal(a.best.offer.label, "Big company");
  near(a.results[0].offer.confidence, 0.4);
  assert.ok(a.results[2].hourly > 0);
  assert.ok(a.findings.some((f) => /would need about/.test(f.title)));
});

test("blank offers are ignored and one offer is enough", () => {
  const a = analyze({ offers: [{ base: "90000" }, {}, {}] });
  assert.equal(a.results.length, 1);
  assert.equal(a.best.offer.label, "Offer 1");
  near(a.best.avg, 90000);
});

test("validation returns a message for bad input", () => {
  for (const bad of [{ offers: [] }, { offers: [{ base: "0" }] }, { offers: [{ base: "1000", confidence: "150" }] }, { offers: [{ base: "1000", bonusPct: "x" }] }, { offers: [{ base: "1000", vestYears: "0", equityGrant: "5" }] }, { offers: Array(MAX_OFFERS + 1).fill({ base: "1000" }) }]) {
    assert.ok(analyze(bad).error, JSON.stringify(bad).slice(0, 60));
  }
});

test("a high equity share is flagged", () => {
  const a = analyze({ offers: [{ base: "100000", equityGrant: "400000", vestYears: "4" }] });
  assert.ok(a.findings.some((f) => /is equity/.test(f.title)));
});

test("csv neutralises formula characters", () => {
  const csv = reportCsv(analyze({ offers: [{ name: "=cmd", base: "1000" }] }));
  assert.match(csv, /'=cmd/);
  assert.equal(parseNum("$1,234"), 1234);
});
