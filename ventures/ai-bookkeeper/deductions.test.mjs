import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { addTrip, removeTrip, setHomeOffice, mileageDeduction, homeOfficeDeduction } from "./deductions.mjs";
import { scheduleC } from "./taxforms.mjs";

const filed = (rows) => {
  const b = importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, t.desc.startsWith("SALE") ? "4000" : "6010"])));
};

test("mileage: rate times miles in integer cents, per calendar year", () => {
  let b = newBooks();
  b = addTrip(b, { date: "2025-03-01", miles: 100, purpose: "client site" }).books;
  b = addTrip(b, { date: "2025-04-01", miles: 33.3, purpose: "supplies run" }).books;
  b = addTrip(b, { date: "2026-01-02", miles: 50, purpose: "other year" }).books;
  const m = mileageDeduction(b, 2025);
  assert.equal(m.miles, 133.3);
  assert.equal(m.cents, Math.round(133.3 * 70)); // 70 cents a mile
  assert.equal(m.cents, 9331);
  assert.deepEqual(mileageDeduction(b, 2026).warnings, [], "one trip before July uses 72.5 and needs no warning");
  assert.equal(mileageDeduction(b, 2026).cents, 3625);
  b = addTrip(b, { date: "2031-01-02", miles: 5, purpose: "far future" }).books;
  assert.match(mileageDeduction(b, 2031).warnings[0], /No standard mileage rate/);
});

test("trips need a purpose, a date and sane miles; ids stay unique after a removal", () => {
  assert.throws(() => addTrip(newBooks(), { date: "2025-01-01", miles: 5, purpose: " " }), /purpose/);
  assert.throws(() => addTrip(newBooks(), { date: "nope", miles: 5, purpose: "x" }), /date/);
  assert.throws(() => addTrip(newBooks(), { date: "2025-01-01", miles: 0, purpose: "x" }), /miles/);
  let b = addTrip(newBooks(), { date: "2025-01-01", miles: 5, purpose: "a" }).books;
  b = addTrip(b, { date: "2025-01-02", miles: 6, purpose: "b" }).books;
  b = removeTrip(b, "MI-1");
  assert.equal(addTrip(b, { date: "2025-01-03", miles: 7, purpose: "c" }).trip.id, "MI-3");
  assert.throws(() => removeTrip(b, "MI-9"), /no trip/);
});

test("home office: $5 a sq ft, 300 cap, prorated by months, limited to profit", () => {
  let b = setHomeOffice(newBooks(), { sqft: 200 });
  assert.equal(homeOfficeDeduction(b, 2025).cents, 100000);
  assert.equal(homeOfficeDeduction(setHomeOffice(newBooks(), { sqft: 500 }), 2025).cents, 150000);
  assert.ok(homeOfficeDeduction(setHomeOffice(newBooks(), { sqft: 500 }), 2025).warnings[0].includes("300"));
  b = setHomeOffice(newBooks(), { sqft: 200, from: "2025-07-01" });
  assert.equal(homeOfficeDeduction(b, 2025).months, 6);
  assert.equal(homeOfficeDeduction(b, 2025).cents, 50000);
  assert.equal(homeOfficeDeduction(b, 2026).months, 12);
  const capped = homeOfficeDeduction(setHomeOffice(newBooks(), { sqft: 200 }), 2025, { profit: 30000 });
  assert.deepEqual([capped.cents, capped.capped], [30000, true]);
  assert.equal(homeOfficeDeduction(setHomeOffice(newBooks(), { sqft: 200 }), 2025, { profit: -5 }).cents, 0);
  assert.equal(setHomeOffice(b, { sqft: 0 }).homeOffice, undefined);
});

test("Schedule C: mileage on line 9, home office on line 30, net profit after both", () => {
  let b = filed([["2025-02-01", "SALE ONE", "10000.00"], ["2025-02-05", "HOST A", "-1000.00"]]);
  b = addTrip(b, { date: "2025-03-01", miles: 1000, purpose: "clients" }).books;
  b = setHomeOffice(b, { sqft: 100 });
  const plain = scheduleC(b, {});
  assert.equal(plain.netProfit, 900000);
  assert.ok(!plain.lines.some((l) => l.line === "30"));
  const sc = scheduleC(b, { year: 2025 });
  assert.equal(sc.lines.find((l) => l.line === "9").cents, 70000);
  assert.equal(sc.totalExpenses, 100000 + 70000);
  assert.equal(sc.tentativeProfit, 830000);
  assert.equal(sc.homeOffice, 50000);
  assert.equal(sc.netProfit, 780000);
  assert.equal(sc.lines.find((l) => l.line === "30").cents, 50000);
});

test("mileage 2026: 72.5 cents to June 30, 76 cents from July 1, each trip at its own date's rate", () => {
  let b = newBooks();
  b = addTrip(b, { date: "2026-06-30", miles: 100, purpose: "a" }).books;
  b = addTrip(b, { date: "2026-07-01", miles: 100, purpose: "b" }).books;
  const m = mileageDeduction(b, 2026);
  assert.equal(m.cents, 7250 + 7600);
  assert.deepEqual(m.segments.map((x) => x.rate), [725, 760]);
  assert.equal(m.label, "100 at 72.5 cents, 100 at 76 cents");
  assert.match(m.warnings[0], /two IRS rates/);
  // only second-half trips: a single 76-cent segment
  const h2 = mileageDeduction(addTrip(newBooks(), { date: "2026-12-31", miles: 10, purpose: "c" }).books, 2026);
  assert.equal(h2.cents, 760); assert.equal(h2.rate, 760);
  // an explicit rate is one flat rate for the year
  assert.equal(mileageDeduction(b, 2026, { rate: 700 }).cents, 14000);
});
