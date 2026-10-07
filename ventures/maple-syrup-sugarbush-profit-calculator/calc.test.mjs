import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, season, parseChannels, DEFAULT_CHANNELS, DEFAULT_SETTINGS, resultCsv, summaryText, money, money2 } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const ONE = parseChannels("All, 40, 0, 0, 100").channels;

test("the rule of 86 turns sap into syrup", () => {
  const s = { ...DEFAULT_SETTINGS, taps: 100, galPerTap: 10, brix: 2 };
  near(season(s, ONE, false).syrupGal, 1000 / 43);
  near(season(s, ONE, false).sapGal, 1000);
});

test("fuel follows the water that has to be boiled off", () => {
  const s = { ...DEFAULT_SETTINGS, taps: 100, galPerTap: 10, brix: 2, efficiencyPct: 50, fuelBtuPerUnit: 1_000_000, fuelPricePerUnit: 10 };
  const r = season(s, ONE, false);
  const water = 1000 * 8.4 - r.syrupGal * 11;
  near(r.fuelUnits, water * 1150 / 0.5 / 1_000_000, 0.001);
  near(r.fuel, r.fuelUnits * 10, 0.01);
});

test("reverse osmosis cuts the boiler load and boiling hours but not syrup", () => {
  const s = { ...DEFAULT_SETTINGS, brix: 2, roConcBrix: 8 };
  const a = season(s, ONE, false), b = season(s, ONE, true);
  near(b.syrupGal, a.syrupGal, 1e-9);
  near(b.boilerSap, a.boilerSap / 4, 1e-6);
  assert.ok(b.fuel < a.fuel * 0.3);
  assert.ok(b.boilHours < a.boilHours);
  assert.ok(b.roCost > 0 && a.roCost === 0);
});

test("profit is revenue less cash costs, depreciation and labour", () => {
  const s = { ...DEFAULT_SETTINGS };
  const r = season(s, parseChannels("All, 50, 2, 10, 100").channels, false);
  near(r.revenue, r.syrupGal * 50);
  near(r.packaging, r.syrupGal * 2);
  near(r.fees, r.revenue * 0.1);
  near(r.beforeLabor, r.revenue - r.fuel - r.supplies - r.packaging - r.fees - r.overhead - r.tubing - r.evaporator);
  near(r.profit, r.beforeLabor - r.labor);
  near(r.labor, r.hours * s.laborRate);
});

test("channel shares are scaled to 100 and warned about", () => {
  const r = analyze("A, 30, 0, 0, 30\nB, 90, 0, 0, 30", {});
  near(r.summary.parts.reduce((x, p) => x + p.gal, 0), r.summary.syrupGal, 1e-6);
  assert.ok(r.warnings.some((w) => /not 100/.test(w.text)));
});

test("default example: break-even at the margin, RO pays back, poor season loses", () => {
  const r = analyze(DEFAULT_CHANNELS, {});
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.summary.profit) < 1500);
  assert.ok(r.summary.roGain > 0);
  assert.ok(r.summary.paybackYears > 1 && r.summary.paybackYears < 4);
  assert.ok(r.seasons[0].profit < r.seasons[1].profit && r.seasons[1].profit < r.seasons[2].profit);
  assert.ok(r.seasons[0].profit < 0);
});

test("a loss and a price below cost are flagged high", () => {
  const r = analyze("Bulk, 15, 0, 0, 100", {});
  assert.ok(r.warnings.filter((w) => w.level === "high").length >= 2);
});

test("RO that costs more than it saves says so and has no payback", () => {
  const r = analyze(DEFAULT_CHANNELS, { taps: 50, roCapital: 20000 });
  assert.ok(r.summary.roGain < 0);
  assert.equal(r.summary.paybackYears, null);
  assert.ok(r.warnings.some((w) => /lower profit/.test(w.text)));
});

test("useRo switches the headline scenario", () => {
  const off = analyze(DEFAULT_CHANNELS, { useRo: 0 }), on = analyze(DEFAULT_CHANNELS, { useRo: 1 });
  assert.ok(on.summary.profit > off.summary.profit);
  near(on.summary.profit, off.summary.withRo.profit);
});

test("parse rejects bad lines and duplicates", () => {
  const { channels, errors } = parseChannels("A, 30\nbad\nA, 40\nB, -1\nC, 40, 0, 120");
  assert.deepEqual(channels.map((c) => c.name), ["A"]);
  assert.equal(errors.length, 4);
});

test("empty and invalid input returns errors, not a crash", () => {
  assert.equal(analyze("", {}).summary, null);
  assert.equal(analyze(DEFAULT_CHANNELS, { taps: 0 }).summary, null);
});

test("csv and summary render", () => {
  const r = analyze(DEFAULT_CHANNELS, {});
  assert.equal(resultCsv(r).trim().split("\n").length, 6);
  assert.match(summaryText(r), /Not tax, legal or food-safety advice/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(2), "$2.00");
});
