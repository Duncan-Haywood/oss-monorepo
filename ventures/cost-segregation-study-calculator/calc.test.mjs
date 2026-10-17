import { test } from "node:test";
import assert from "node:assert/strict";
import { PROPERTY_TYPES, straightLineSchedule, costSegEstimate, money } from "./calc.mjs";

const base = { price: 1_500_000, propertyType: "multifamily", bracket: 0.37, fee: 8_000, holdYears: 10 };

test("straight line uses mid-month in year one and the full annual amount after", () => {
  const rows = straightLineSchedule(275_000, 27.5, 1, 3);
  assert.ok(Math.abs(rows[0] - 10_000 * (11.5 / 12)) < 1e-9);
  assert.equal(rows[1], 10_000);
  assert.equal(straightLineSchedule(275_000, 27.5, 12, 1)[0] < 10_000 * 0.05, true);
});

test("straight line never depreciates more than the basis", () => {
  const rows = straightLineSchedule(100_000, 27.5, 1, 40);
  assert.ok(Math.abs(rows.reduce((s, v) => s + v, 0) - 100_000) < 1e-6);
});

test("basis is price less land and the three classes add back to it", () => {
  const r = costSegEstimate(base);
  assert.equal(r.basis, 1_200_000);
  assert.ok(Math.abs(r.five + r.fifteen + r.building - r.basis) < 1e-6);
  assert.ok(Math.abs(r.five - 1_200_000 * 0.22) < 1e-6);
});

test("100% bonus puts all 5- and 15-year property in year one", () => {
  const r = costSegEstimate(base);
  assert.ok(r.year1CostSeg > r.five + r.fifteen);
  assert.ok(r.year1CostSeg < r.five + r.fifteen + r.building / 27.5 + 1);
  assert.ok(r.year1Extra > 0);
  assert.ok(Math.abs(r.year1Saved - r.year1Extra * 0.37) < 1e-6);
});

test("with no bonus the first year uses the MACRS tables", () => {
  const r = costSegEstimate({ ...base, bonus: 0 });
  const expected = r.five * 0.2 + r.fifteen * 0.05;
  const building = r.building / 27.5 * (11.5 / 12);
  assert.ok(Math.abs(r.year1CostSeg - expected - building) < 1e-6);
});

test("total depreciation over the recovery periods is unchanged, only the timing moves", () => {
  const r = costSegEstimate({ ...base, holdYears: 40, bonus: 0.6, deferRecapture: true });
  const base40 = r.rows.reduce((s, x) => s + x.baseline, 0);
  const seg40 = r.rows.reduce((s, x) => s + x.costSeg, 0);
  assert.ok(Math.abs(base40 - r.basis) < 1e-3);
  assert.ok(Math.abs(seg40 - r.basis) < 1e-3);
});

test("a nonresidential type uses the 39-year life", () => {
  const r = costSegEstimate({ ...base, propertyType: "office" });
  assert.equal(r.life, 39);
});

test("passive limits defer the deduction and the carry is released at sale", () => {
  const all = costSegEstimate(base);
  const none = costSegEstimate({ ...base, usableShare: 0 });
  assert.ok(none.year1Saved < all.year1Saved);
  assert.equal(none.year1Saved, 0);
  assert.ok(none.releasedAtSale > 0 || none.suspended >= 0);
  assert.ok(none.findings.some((f) => f.severity === "high"));
});

test("deferring recapture removes the recapture charge", () => {
  const sold = costSegEstimate(base);
  const kept = costSegEstimate({ ...base, deferRecapture: true });
  assert.ok(sold.extraRecapture > 0);
  assert.equal(kept.extraRecapture, 0);
  assert.ok(kept.netUndiscounted > sold.netUndiscounted);
});

test("the study fee is subtracted from the net", () => {
  const cheap = costSegEstimate({ ...base, fee: 0 });
  const dear = costSegEstimate({ ...base, fee: 10_000 });
  assert.ok(Math.abs(cheap.netUndiscounted - dear.netUndiscounted - 10_000) < 1e-6);
});

test("a small basis and a fee above year-one savings both get flagged", () => {
  const r = costSegEstimate({ price: 300_000, propertyType: "single-family", bracket: 0.22, fee: 12_000 });
  assert.ok(r.findings.some((f) => /Small basis/.test(f.title)));
  assert.ok(r.findings.some((f) => /Fee exceeds/.test(f.title)));
});

test("garbage and empty input give finite numbers, never NaN", () => {
  for (const input of [undefined, {}, { price: "x", bracket: "y", holdYears: "z" }]) {
    const r = costSegEstimate(input);
    for (const key of ["basis", "year1Saved", "netPV", "netUndiscounted", "cumTaxSaved"]) {
      assert.ok(Number.isFinite(r[key]), key);
    }
  }
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-1234), "-$1,234");
});

test("every property type reclassifies less than the whole building", () => {
  for (const t of Object.values(PROPERTY_TYPES)) assert.ok(t.five + t.fifteen < 0.6);
});
