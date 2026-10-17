import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, giftGain, futureValue, scenario, sensitivity, analyze, num, toCsv } from "./calc.mjs";

const base = { ...DEFAULTS, years: 0, growth: 0, otherEstate: 0 };

test("dual basis: gain uses donor basis, loss uses fair value at gift, middle is nothing", () => {
  assert.equal(giftGain(500000, 90000, 450000), 410000);
  assert.equal(giftGain(400000, 500000, 450000), -50000);
  assert.equal(giftGain(480000, 500000, 450000), 0);
});

test("a gift carries the donor's basis; inheritance resets it to fair value", () => {
  const s = scenario({ ...base });
  assert.equal(s.gift.gain, 360000);
  assert.equal(s.inherit.gain, 0);
  assert.equal(s.inherit.basis, 450000);
  assert.ok(Math.abs(s.gift.gainTax - 360000 * 0.19) < 1e-6);
  assert.equal(s.best, "Inherit it");
});

test("far below the exemption, inheriting always costs less than gifting an appreciated asset", () => {
  const a = analyze({ ...DEFAULTS });
  assert.equal(a.giftBeatsInherit, false);
  assert.ok(a.margin < 0);
});

test("a big estate flips it: gifting growth out of the estate beats the 40% estate tax", () => {
  const a = analyze({ ...DEFAULTS, otherEstate: 30000000, years: 25, growth: 6, value: 2000000, basis: 200000 });
  assert.equal(a.giftBeatsInherit, true);
  assert.ok(a.estateTaxSaved > 0);
});

test("Form 709 is needed only above the annual exclusion for the number of recipients", () => {
  assert.equal(scenario({ ...base, value: 30000, share: 100, donees: 2 }).needs709, false);
  assert.equal(scenario({ ...base, value: 40000, share: 100, donees: 2 }).needs709, true);
  assert.equal(scenario({ ...base, value: 450000 }).taxableGift, 431000);
});

test("adding a person to the deed moves only that share", () => {
  const s = scenario({ ...base, share: 50 });
  assert.equal(s.taxableGift, 225000 - 19000);
  assert.equal(s.gift.gain, 180000);
});

test("selling now uses the home exclusion", () => {
  const s = scenario({ ...base, value: 450000, basis: 90000, exclusion: 250000 });
  assert.equal(s.sellNow.gain, 110000);
  assert.equal(scenario({ ...base, isHome: 0 }).sellNow.gain, 360000);
});

test("growth compounds and sensitivity lists every horizon", () => {
  assert.ok(Math.abs(futureValue(100, 10, 2) - 121) < 1e-9);
  assert.equal(sensitivity(DEFAULTS).length, 5);
});

test("analyze rejects bad input", () => {
  assert.equal(analyze({ value: -1 }).result, null);
  assert.equal(analyze({ share: 0 }).result, null);
  assert.equal(analyze({ donees: 0 }).result, null);
  assert.ok(analyze({}).result);
});

test("num parses currency strings, csv has all rows", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(toCsv(analyze({})).trim().split("\n").length, 4);
});
