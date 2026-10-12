import test from "node:test";
import assert from "node:assert/strict";
import { buildTable, breakEvenLift, roundPrice, parseShares, parseIndexOverrides, revenueModel, discountGroups, toCsv, toJson, validate, DEFAULTS, COUNTRIES } from "./ppp.mjs";

const by = (rows, code) => rows.find((r) => r.code === code);

test("the reference market pays the base price and poorer markets pay less", () => {
  const rows = buildTable({ base: 29 });
  assert.equal(by(rows, "US").price, 28.99);
  assert.ok(by(rows, "IN").price < by(rows, "BR").price);
  assert.ok(by(rows, "BR").price < by(rows, "DE").price);
});

test("strength 0 means one price everywhere", () => {
  const rows = buildTable({ base: 20, strength: 0, rounding: "none" });
  assert.ok(rows.every((r) => r.price === 20));
});

test("the floor is never undercut and the cap never exceeded", () => {
  const rows = buildTable({ base: 100, strength: 1, floor: 0.4, cap: 1, rounding: "none" });
  assert.ok(rows.every((r) => r.price >= 40 && r.price <= 100));
  const prem = buildTable({ base: 100, strength: 1, floor: 0.4, cap: 1.2, rounding: "none" });
  assert.equal(by(prem, "CH").price, 120);
});

test("rounding styles", () => {
  assert.equal(roundPrice(12.4, "charm"), 11.99);
  assert.equal(roundPrice(12.7, "charm"), 12.99);
  assert.equal(roundPrice(0.2, "charm"), 0.99);
  assert.equal(roundPrice(12.4, "whole"), 12);
  assert.equal(roundPrice(21, "nine"), 19);
  assert.equal(roundPrice(24, "nine"), 29);
  assert.equal(roundPrice(3.333, "none"), 3.33);
});

test("tiers collapse countries into at most N price points and keep the reference at full price", () => {
  const rows = buildTable({ base: 29, tiers: 4 });
  const prices = new Set(rows.map((r) => r.price));
  assert.ok(prices.size <= 4);
  assert.equal(by(rows, "US").price, 28.99);
  assert.equal(by(rows, "US").tier, 1);
});

test("overrides replace the built-in index", () => {
  const { overrides, bad } = parseIndexOverrides("in 50\n# comment\nbogus line\nBR,60");
  assert.deepEqual(overrides, { IN: 50, BR: 60 });
  assert.deepEqual(bad, ["bogus line"]);
  const rows = buildTable({ base: 29, rounding: "none" }, overrides);
  assert.equal(by(rows, "IN").index, 50);
});

test("validation rejects nonsense and buildTable throws on it", () => {
  assert.ok(validate({ base: 0 }).length);
  assert.ok(validate({ strength: 2 }).length);
  assert.ok(validate({ cap: 0.5 }).length);
  assert.ok(validate({ tiers: 1.5 }).length);
  assert.deepEqual(validate(DEFAULTS), []);
  assert.throws(() => buildTable({ base: -1 }), /Base price/);
});

test("break-even lift is the conversion gain a discount has to buy", () => {
  assert.equal(breakEvenLift(0), 0);
  assert.ok(Math.abs(breakEvenLift(0.5) - 1) < 1e-9);
  assert.ok(Math.abs(breakEvenLift(0.2) - 0.25) < 1e-9);
  assert.equal(breakEvenLift(1), Infinity);
});

test("traffic parsing takes codes and names, normalises, and reports bad lines", () => {
  const { shares, bad } = parseShares("US 50\nIndia 30%\nIN 20\nAtlantis 5\nfoo");
  assert.ok(Math.abs(shares.US - 0.5) < 1e-9);
  assert.ok(Math.abs(shares.IN - 0.5) < 1e-9);
  assert.deepEqual(bad, ["Atlantis 5", "foo"]);
});

test("revenue model: elasticity 1 is flat, below 1 loses, above 1 gains; no-traffic markets are ignored", () => {
  const rows = buildTable({ base: 20, rounding: "none" });
  const shares = { US: 0.5, IN: 0.5 };
  const flat = revenueModel(rows, shares, { base: 20, elasticity: 1, baseConversion: 0.02 });
  assert.ok(Math.abs(flat.change) < 1e-6);
  assert.ok(revenueModel(rows, shares, { base: 20, elasticity: 0.5 }).change < 0);
  assert.ok(revenueModel(rows, shares, { base: 20, elasticity: 2 }).change > 0);
  assert.equal(flat.detail.length, 2);
});

test("discount groups round to 5% and omit full-price markets", () => {
  const groups = discountGroups(buildTable({ base: 29 }));
  assert.ok(groups.every((g) => g.pct > 0 && g.pct % 5 === 0));
  assert.ok(!groups.some((g) => g.codes.includes("US")));
});

test("csv and json export carry every country", () => {
  const rows = buildTable({ base: 29 });
  assert.equal(toCsv(rows).split("\n").length, COUNTRIES.length + 1);
  const j = JSON.parse(toJson(rows, { base: 29 }));
  assert.equal(Object.keys(j.prices).length, COUNTRIES.length);
});
