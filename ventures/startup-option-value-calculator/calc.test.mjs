import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseNum, vestedFraction, ownershipPerOption, commonProceeds, valueAtExit, exitNeeded, sampleInput, reportCsv } from "./calc.mjs";

const P = { options: 10000, strike: 1, fullyDiluted: 10_000_000, dilution: 0.2, rounds: 1, prefStack: 20_000_000, cliffMonths: 12, vestMonths: 48, stayMonths: 48, taxRate: 0.25 };

test("parseNum strips formatting and understands k/M/B suffixes", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum("20M"), 20e6);
  assert.equal(parseNum("1.5b"), 1.5e9);
  assert.equal(parseNum("300k"), 300000);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("vesting respects the cliff", () => {
  assert.equal(vestedFraction(11, 12, 48), 0);
  assert.equal(vestedFraction(12, 12, 48), 0.25);
  assert.equal(vestedFraction(60, 12, 48), 1);
});

test("ownership per option is diluted by each round", () => {
  assert.ok(Math.abs(ownershipPerOption(P) - 0.8 / 10_000_000) < 1e-15);
  assert.ok(Math.abs(ownershipPerOption({ ...P, rounds: 2 }) - 0.64 / 10_000_000) < 1e-15);
});

test("preferences come off the top and never go negative", () => {
  assert.equal(commonProceeds(100, 30), 70);
  assert.equal(commonProceeds(10, 30), 0);
});

test("value at exit: hand-checked", () => {
  // exit 220M, prefs 20M -> 200M common; per option 200M*0.8/10M = 16; spread 15
  // gross 150,000 on 10,000 vested; tax 25% = 37,500; net 112,500
  const v = valueAtExit(P, 220_000_000);
  assert.equal(v.vested, 10000);
  assert.ok(Math.abs(v.perOption - 16) < 1e-9);
  assert.ok(Math.abs(v.gross - 150000) < 1e-6);
  assert.ok(Math.abs(v.net - 112500) < 1e-6);
  assert.equal(v.exerciseCost, 10000);
});

test("underwater options are worth zero, not negative", () => {
  assert.equal(valueAtExit(P, 21_000_000).net, 0);
  assert.equal(valueAtExit(P, 0).net, 0);
});

test("leaving before the cliff keeps nothing", () => {
  assert.equal(valueAtExit({ ...P, stayMonths: 6 }, 500_000_000).net, 0);
});

test("exitNeeded inverts valueAtExit", () => {
  const target = 50000;
  const x = exitNeeded(P, target);
  assert.ok(Math.abs(valueAtExit(P, x).net - target) < 1e-4);
  const zero = exitNeeded(P, 0);
  assert.ok(Math.abs(valueAtExit(P, zero).net) < 1e-6);
  assert.ok(valueAtExit(P, zero + 1_000_000).net > 0);
  assert.equal(exitNeeded({ ...P, stayMonths: 3 }, 0), null);
});

test("analyze on the sample input", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, null);
  assert.equal(a.scenarios.length, 4);
  const probs = a.scenarios.reduce((s, x) => s + x.prob, 0);
  assert.ok(Math.abs(probs - 1) < 1e-9);
  assert.equal(a.scenarios[0].net, 0);
  assert.ok(a.expected > 0);
  assert.ok(a.pv < a.expected);
  assert.equal(a.paySacrificed, 120000);
  assert.ok(a.findings.some((f) => /probability-weighted/i.test(f.title)));
  assert.ok(a.findings.some((f) => /give up about \$120,000/.test(f.title)));
});

test("expected value equals the hand-weighted sum", () => {
  const a = analyze({ ...sampleInput(), discount: "0" });
  const by = (s) => s.prob * s.net;
  assert.ok(Math.abs(a.expected - a.scenarios.reduce((t, s) => t + by(s), 0)) < 1e-6);
  assert.equal(a.pv, a.expected);
});

test("input validation names the problem", () => {
  assert.match(analyze({ ...sampleInput(), options: "" }).error, /Options granted/);
  assert.match(analyze({ ...sampleInput(), fullyDiluted: "0" }).error, /Fully diluted/);
  assert.match(analyze({ ...sampleInput(), pSmall: "60", pGood: "30", pBig: "20" }).error, /100%/);
  assert.match(analyze({ ...sampleInput(), cliffMonths: "60", vestMonths: "48" }).error, /cliff/);
});

test("a short stay is flagged", () => {
  const a = analyze({ ...sampleInput(), stayMonths: "6" });
  assert.ok(a.findings.some((f) => /before the 12-month cliff/.test(f.title)));
  assert.equal(a.expected, 0);
});

test("csv has a header, four scenarios and the weighted row", () => {
  const rows = reportCsv(analyze(sampleInput())).trim().split("\n");
  assert.equal(rows.length, 6);
  assert.match(rows[0], /scenario/);
  assert.match(rows[5], /Probability-weighted/);
});
