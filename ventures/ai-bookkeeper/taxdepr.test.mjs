import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addAsset, disposeAsset } from "./assets.mjs";
import { MACRS_HALF_YEAR, setTaxTreatment, assetTaxYear, taxDepreciation } from "./taxdepr.mjs";

const with1 = (cost, date, tax, life = 60) => {
  let b = addAsset(newBooks(), { name: "Machine", date, cost, lifeMonths: life }).books;
  return setTaxTreatment(b, "FA-1", tax).books;
};

test("every half-year table adds to 100 percent", () => {
  for (const [cls, t] of Object.entries(MACRS_HALF_YEAR)) assert.equal(t.reduce((s, p) => s + p, 0), 100000, `class ${cls}`);
});

test("table lengths are class + 1 years", () => {
  for (const [cls, t] of Object.entries(MACRS_HALF_YEAR)) assert.equal(t.length, +cls + 1);
});

test("5-year property: IRS percentages, cents add up to the cost", () => {
  const b = with1("10000", "2026-03-10", { macrsClass: 5 });
  const a = b.assets[0];
  const yrs = [2026, 2027, 2028, 2029, 2030, 2031, 2032].map((y) => assetTaxYear(a, y).total);
  assert.deepEqual(yrs, [200000, 320000, 192000, 115200, 115200, 57600, 0]);
  assert.equal(yrs.reduce((s, x) => s + x, 0), 1000000);
});

test("odd cents still close exactly", () => {
  const b = with1("1234.57", "2026-05-01", { macrsClass: 7 });
  const total = [...Array(10).keys()].reduce((s, i) => s + assetTaxYear(b.assets[0], 2026 + i).total, 0);
  assert.equal(total, 123457);
});

test("section 179 and bonus come off first; MACRS runs on what is left", () => {
  const b = with1("10000", "2026-02-01", { macrsClass: 5, s179: 200000, bonusPct: 50 });
  const y1 = assetTaxYear(b.assets[0], 2026);
  assert.equal(y1.s179, 200000);
  assert.equal(y1.bonus, 400000); // 50% of 8,000
  assert.equal(y1.macrs, 80000);  // 20% of the remaining 4,000
  assert.equal(y1.total, 680000);
  assert.equal(assetTaxYear(b.assets[0], 2027).s179, 0);
  const all = [...Array(7).keys()].reduce((s, i) => s + assetTaxYear(b.assets[0], 2026 + i).total, 0);
  assert.equal(all, 1000000);
});

test("disposal year takes half, later years nothing", () => {
  let b = with1("10000", "2026-03-10", { macrsClass: 5 });
  b = disposeAsset(b, "FA-1", { date: "2027-06-30" }).books;
  assert.equal(assetTaxYear(b.assets[0], 2027).macrs, 160000);
  assert.equal(assetTaxYear(b.assets[0], 2028).macrs, 0);
});

test("worksheet compares with book depreciation and flags what it cannot check", () => {
  const b = with1("10000", "2026-03-10", { macrsClass: 5, s179: 100000 });
  const w = taxDepreciation(b, 2026);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].total, 100000 + 180000);
  assert.ok(w.rows[0].book > 0);
  assert.equal(w.rows[0].difference, w.rows[0].total - w.rows[0].book);
  assert.ok(w.warnings.some((x) => /Section 179 dollar limits/.test(x)));
});

test("mid-quarter test warning when over 40% lands in Q4; untreated assets are listed", () => {
  let b = with1("1000", "2026-02-01", { macrsClass: 5 });
  b = addAsset(b, { name: "Late", date: "2026-11-15", cost: "9000" }).books;
  b = setTaxTreatment(b, "FA-2", { macrsClass: 5 }).books;
  assert.ok(taxDepreciation(b, 2026).warnings.some((x) => /mid-quarter/.test(x)));
  b = addAsset(b, { name: "Forgot", date: "2026-01-02", cost: "500" }).books;
  assert.ok(taxDepreciation(b, 2026).warnings.some((x) => /FA-3/.test(x)));
});

test("bad treatment is refused", () => {
  const b = addAsset(newBooks(), { name: "X", date: "2026-01-01", cost: "100" }).books;
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 4 }), /class/);
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 5, bonusPct: 120 }), /Bonus/);
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 5, s179: 99999 }), /Section 179/);
  assert.throws(() => setTaxTreatment(b, "FA-9", { macrsClass: 5 }), /No asset/);
});

test("the worksheet CSV has a row per asset and a total", async () => {
  const { taxDepreciationCsv } = await import("./taxdepr.mjs");
  const b = with1("10000", "2026-03-10", { macrsClass: 5 });
  const csv = taxDepreciationCsv(taxDepreciation(b, 2026)).trim().split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[1], /,5,10000\.00,0\.00,0\.00,2000\.00,2000\.00,/);
  assert.match(csv[2], /^Total 2026,/);
});
