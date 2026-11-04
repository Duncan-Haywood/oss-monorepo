// Property test for mileage and home-office deductions (made-up trips, seeded, no outside data).
// Invariants: trip order never changes the deduction; each trip is priced at its own date's
// rate (2026 splits at 2026-07-01); adding a trip never lowers the total; a flat `rate`
// override prices every mile the same; removeTrip undoes addTrip; the home office is never
// above $1,500, never above business profit, never negative, and the books are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { addTrip, removeTrip, setHomeOffice, mileageDeduction, homeOfficeDeduction, MILEAGE_RATES, HOME_MAX_SQFT } from "./deductions.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function randomBooks(r, year, n) {
  let books = {};
  for (let i = 0; i < n; i++) {
    const date = iso(year, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28));
    books = addTrip(books, { date, miles: Math.round((0.1 + r() * 400) * 10) / 10, purpose: "client visit" }).books;
  }
  return books;
}

test("mileage deduction ignores trip order and prices by date (300 random books)", () => {
  const r = rng(20261104);
  for (let i = 0; i < 300; i++) {
    const year = [2024, 2025, 2026][Math.floor(r() * 3)];
    const books = randomBooks(r, year, 1 + Math.floor(r() * 12));
    const before = JSON.stringify(books);
    const a = mileageDeduction(books, year);
    const shuffled = { ...books, mileage: [...books.mileage].sort(() => r() - 0.5) };
    const b = mileageDeduction(shuffled, year);
    assert.equal(JSON.stringify(books), before, "books changed");
    assert.ok(a.cents >= 0 && Number.isInteger(a.cents), "cents " + a.cents);
    assert.equal(a.cents, b.cents, "order changed the total " + JSON.stringify({ y: year, a: a.cents, b: b.cents, t: books.mileage.map((t) => [t.date, t.miles]) }));
    assert.equal(a.miles, b.miles);
    // flat override: every mile at one rate
    const flat = mileageDeduction(books, year, { rate: 700 });
    assert.ok(Math.abs(flat.cents - Math.round((flat.miles * 700) / 10)) <= 1);
    if (year < 2026) assert.equal(a.cents, Math.round((a.miles * MILEAGE_RATES[year]) / 10));
    else {
      const lo = Math.round((a.miles * 725) / 10), hi = Math.round((a.miles * 760) / 10);
      assert.ok(a.cents >= lo - 2 && a.cents <= hi + 2, `2026 total ${a.cents} outside ${lo}..${hi}`);
    }
    // another year's trips never leak in
    assert.equal(mileageDeduction(books, year - 1).cents, 0);
  }
});

test("adding a trip never lowers the deduction, removing it restores it (200 random books)", () => {
  const r = rng(77);
  for (let i = 0; i < 200; i++) {
    const year = 2026, books = randomBooks(r, year, Math.floor(r() * 8));
    const base = mileageDeduction(books, year).cents;
    const date = iso(year, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28));
    const { books: more, trip } = addTrip(books, { date, miles: 1 + Math.floor(r() * 300), purpose: "supplies" });
    assert.ok(mileageDeduction(more, year).cents >= base, "total fell after adding a trip");
    assert.deepEqual(removeTrip(more, trip.id).mileage, books.mileage ?? []);
  }
});

test("home office stays within $1,500, profit and zero (400 random cases)", () => {
  const r = rng(4242);
  for (let i = 0; i < 400; i++) {
    const sqft = 1 + Math.floor(r() * 600);
    const from = r() < 0.5 ? iso(2026, 1 + Math.floor(r() * 12), 1) : null;
    const to = r() < 0.5 ? iso(2026, 1 + Math.floor(r() * 12), 28) : null;
    const books = setHomeOffice({}, { sqft, from, to });
    const profit = r() < 0.2 ? null : Math.floor((r() - 0.3) * 400000);
    const before = JSON.stringify(books);
    const h = homeOfficeDeduction(books, 2026, { profit });
    assert.equal(JSON.stringify(books), before);
    const tag = JSON.stringify({ sqft, from, to, profit });
    assert.ok(h.cents >= 0 && h.cents <= HOME_MAX_SQFT * 500, "range " + tag);
    if (profit !== null) assert.ok(h.cents <= Math.max(0, profit), "above profit " + tag);
    assert.ok(h.months >= 0 && h.months <= 12, "months " + tag);
    assert.equal(h.capped, h.cents < h.uncapped, tag);
    // a bigger profit never lowers the deduction
    if (profit !== null) assert.ok(homeOfficeDeduction(books, 2026, { profit: profit + 1000 }).cents >= h.cents, "monotone " + tag);
  }
});
