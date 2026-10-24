import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addAsset, disposeAsset } from "./assets.mjs";
import { MACRS_MID_QUARTER, usesMidQuarter, MACRS_HALF_YEAR, setTaxTreatment, assetTaxYear, taxDepreciation, maxBonusPct, s179Check, s179IncomeLimit } from "./taxdepr.mjs";

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

test("mid-quarter disposal takes the disposal quarter's midpoint share of the year", () => {
  const full = (d) => {
    let b = with1("10000", "2026-11-10", { macrsClass: 5 });
    const f = assetTaxYear(b.assets[0], 2027, true).macrs;
    b = disposeAsset(b, "FA-1", { date: d }).books;
    return [f, assetTaxYear(b.assets[0], 2027, true).macrs];
  };
  for (const [d, k] of [["2027-02-10", 1], ["2027-05-10", 3], ["2027-08-10", 5], ["2027-12-10", 7]]) {
    const [f, got] = full(d);
    assert.equal(got, Math.round((f * k) / 8), d);
  }
  assert.equal(assetTaxYear(disposeAsset(with1("10000", "2026-11-10", { macrsClass: 5 }), "FA-1", { date: "2027-12-10" }).books.assets[0], 2028, true).macrs, 0);
});

test("worksheet compares with book depreciation and flags what it cannot check", () => {
  const b = with1("10000", "2026-03-10", { macrsClass: 5, s179: 100000 });
  const w = taxDepreciation(b, 2026);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].total, 100000 + 180000);
  assert.ok(w.rows[0].book > 0);
  assert.equal(w.rows[0].difference, w.rows[0].total - w.rows[0].book);
  assert.ok(w.warnings.some((x) => /Section 179 limits agree with published secondary sources/.test(x)));
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

test("CSV has a row per asset, totals and the notes", async () => {
  const { taxDepreciationCsv } = await import("./taxdepr.mjs");
  const b = with1("10000", "2026-03-10", { macrsClass: 5, s179: 100000 });
  const lines = taxDepreciationCsv(taxDepreciation(b, 2026)).trim().split("\n");
  assert.match(lines[0], /^Asset,Name,Placed in service,MACRS class/);
  assert.match(lines[1], /^FA-1,.*,5,10000\.00,1000\.00,0\.00,1800\.00,2800\.00,/);
  assert.match(lines[2], /^Total,/);
  assert.ok(lines.slice(3).every((l) => l.startsWith("Note,")));
});

// Independent check of the typed Table A-1 figures: derive them from the rules
// (200% declining balance for 3-10 year property, 150% for 15 and 20, half-year
// first year, switch to straight-line when it gives more) and compare to the
// table within rounding of the printed digits.
function derive(life, factor) {
  const out = [];
  let remaining = 100;
  const rate = factor / life;
  for (let y = 1; y <= life + 1; y++) {
    const db = remaining * rate * (y === 1 ? 0.5 : 1);
    const sl = y === 1 ? db : remaining / (life - (y - 1) + 0.5);
    let amt = Math.max(db, sl);
    if (y === life + 1) amt = remaining;
    out.push(amt); remaining -= amt;
  }
  return out;
}
test("Table A-1 percentages match the declining-balance rules they come from", () => {
  for (const [life, factor, tol] of [[3, 2, 0.011], [5, 2, 0.011], [7, 2, 0.011], [10, 2, 0.011], [15, 1.5, 0.011], [20, 1.5, 0.0011]]) {
    const d = derive(life, factor), t = MACRS_HALF_YEAR[life];
    assert.equal(d.length, t.length, `class ${life} length`);
    d.forEach((p, i) => assert.ok(Math.abs(p - t[i] / 1000) <= tol, `class ${life} year ${i + 1}: derived ${p.toFixed(4)} vs table ${(t[i] / 1000).toFixed(3)}`));
  }
});

test("section 179 and bonus accept their exact limits and reject one step past", () => {
  const b = with1("10000", "2026-02-01", { macrsClass: 5 });
  assert.equal(setTaxTreatment(b, "FA-1", { macrsClass: 5, s179: 1000000 }).asset.tax.s179, 1000000);
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 5, s179: 1000001 }), /Section 179/);
  assert.equal(setTaxTreatment(b, "FA-1", { macrsClass: 5, bonusPct: 100 }).asset.tax.bonusPct, 100);
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 5, bonusPct: 100.5 }), /Bonus percent/);
  assert.throws(() => setTaxTreatment(b, "FA-1", { macrsClass: 5, bonusPct: -1 }), /Bonus percent/);
});

test("every mid-quarter table adds to 100 percent", () => {
  for (const [cls, qs] of Object.entries(MACRS_MID_QUARTER)) for (const t of qs) assert.equal(t.reduce((s, p) => s + p, 0), 100000, `class ${cls}`);
});

test("5-year mid-quarter rows match the published Q1 and Q4 percentages", () => {
  assert.deepEqual(MACRS_MID_QUARTER[5][0], [35000, 26000, 15600, 11010, 11010, 1380]);
  assert.deepEqual(MACRS_MID_QUARTER[5][3], [5000, 38000, 22800, 13680, 10940, 9580]);
});

test("more than 40 percent of basis in Q4 switches the whole year to mid-quarter", () => {
  let b = addAsset(newBooks(), { name: "A", date: "2026-02-01", cost: "5000", lifeMonths: 60 }).books;
  b = addAsset(b, { name: "B", date: "2026-11-01", cost: "5000", lifeMonths: 60 }).books;
  b = setTaxTreatment(b, "FA-1", { macrsClass: 5 }).books;
  b = setTaxTreatment(b, "FA-2", { macrsClass: 5 }).books;
  assert.equal(usesMidQuarter(b, 2026), true);
  const w = taxDepreciation(b, 2026);
  assert.equal(w.rows[0].macrs, 175000); // Q1: 35% of 5,000
  assert.equal(w.rows[1].macrs, 25000);  // Q4: 5% of 5,000
  assert.ok(w.warnings.some((x) => /mid-quarter convention applies/.test(x)));
});

test("exactly 40 percent in Q4 stays on the half-year tables", () => {
  let b = addAsset(newBooks(), { name: "A", date: "2026-02-01", cost: "6000", lifeMonths: 60 }).books;
  b = addAsset(b, { name: "B", date: "2026-11-01", cost: "4000", lifeMonths: 60 }).books;
  b = setTaxTreatment(setTaxTreatment(b, "FA-1", { macrsClass: 5 }).books, "FA-2", { macrsClass: 5 }).books;
  assert.equal(usesMidQuarter(b, 2026), false);
});

test("179 over the dollar limit is flagged with the excess", () => {
  const b = with1("3000000", "2026-03-10", { macrsClass: 7, s179: "3000000" });
  const c = s179Check(b, 2026);
  assert.equal(c.allowed, 256000000);
  assert.equal(c.excess, 44000000);
  assert.ok(taxDepreciation(b, 2026).warnings.some((x) => /is over and is not allowed/.test(x)));
});

test("179 limit falls dollar for dollar above the investment threshold", () => {
  const b = with1("5000000", "2026-03-10", { macrsClass: 7, s179: "1000000" });
  const c = s179Check(b, 2026);
  assert.equal(c.allowed, 256000000 - (500000000 - 409000000)); // 1,650,000.00
  assert.equal(c.excess, 0);
  assert.ok(!taxDepreciation(b, 2026).warnings.some((x) => /is over/.test(x)));
});

test("a year with no limits on file says so", () => {
  const b = with1("10000", "2031-03-10", { macrsClass: 5, s179: "1000" });
  assert.equal(s179Check(b, 2031), null);
  assert.ok(taxDepreciation(b, 2031).warnings.some((x) => /No Section 179 limits on file for 2031/.test(x)));
});

test("bonus above the year's maximum is flagged; 2025 asks about the acquisition date", () => {
  assert.deepEqual([2022, 2023, 2024, 2025, 2026].map(maxBonusPct), [100, 80, 60, 100, 100]);
  const over = taxDepreciation(with1("10000", "2024-05-01", { macrsClass: 5, bonusPct: 100 }), 2024);
  assert.ok(over.warnings.some((x) => /bonus 100% is above the 60%/.test(x)));
  const ok = taxDepreciation(with1("10000", "2024-05-01", { macrsClass: 5, bonusPct: 60 }), 2024);
  assert.ok(!ok.warnings.some((x) => /is above the/.test(x)));
  const y25 = taxDepreciation(with1("10000", "2025-05-01", { macrsClass: 5, bonusPct: 100 }), 2025);
  assert.ok(y25.warnings.some((x) => /acquired after 19 January 2025/.test(x)));
});

test("179 taxable-income limit defers the excess and carries it forward", () => {
  const b = { assets: [{ id: "A1", name: "Press", date: "2026-03-01", cents: 3000000, tax: { macrsClass: 7, s179: 3000000, bonusPct: 0 } }] };
  assert.equal(s179IncomeLimit(b, 2026), null);
  const r = s179IncomeLimit(b, 2026, { businessIncome: 1200000 });
  assert.deepEqual([r.dollarLimited, r.deductible, r.carryOut], [3000000, 1200000, 1800000]);
  const loss = s179IncomeLimit(b, 2026, { businessIncome: -50000 });
  assert.deepEqual([loss.deductible, loss.carryOut], [0, 3000000]);
  const next = s179IncomeLimit({ assets: [] }, 2027, { businessIncome: 5000000, carryIn: 1800000 });
  assert.deepEqual([next.deductible, next.carryOut], [1800000, 0]);
  const w = taxDepreciation(b, 2026, { businessIncome: 1200000 });
  assert.equal(w.s179Income.carryOut, 1800000);
  assert.ok(w.warnings.some((x) => /carries to 2027/.test(x)));
});

test("7-year mid-quarter rows match the printed Tables A-2 to A-5 and each adds to 100", () => {
  const want = [
    [25000, 21430, 15310, 10930, 8750, 8740, 8750, 1090],
    [17850, 23470, 16760, 11970, 8870, 8870, 8870, 3340],
    [10710, 25510, 18220, 13020, 9300, 8850, 8860, 5530],
    [3570, 27550, 19680, 14060, 10040, 8730, 8730, 7640],
  ];
  assert.deepEqual(MACRS_MID_QUARTER[7], want);
  for (const r of want) assert.equal(r.reduce((s, x) => s + x, 0), 100000);
});
