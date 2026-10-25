// A rideshare and delivery driver's month (fixtures/driver-checking.csv, made up): platform
// payouts are sales, small fuel chains are fuel, and the Schedule C worksheet warns when
// standard mileage and booked fuel would both land on line 9.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement, acceptSuggestions } from "./engine.mjs";
import { addTrip } from "./deductions.mjs";
import { scheduleC } from "./taxforms.mjs";
import { suggest } from "./categorize.mjs";

const csv = readFileSync(new URL("./fixtures/driver-checking.csv", import.meta.url), "utf8");
const load = () => importStatement(newBooks(), csv, "1000").books;

test("Uber, Lyft and DoorDash payouts are suggested as sales; QT as fuel", () => {
  const b = load();
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/UBER USA/, /LYFT/, /DOORDASH/]) assert.equal(code(re), "4000", String(re));
  assert.equal(code(/QT 4411/), "6160");
});

test("small fuel chains are fuel", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
  for (const d of ["CIRCLE K 02211 MESA AZ", "KWIK TRIP 331"]) assert.equal(suggest({ desc: d, cents: -4000 }, model).account, "6160", d);
});

test("standard mileage next to booked fuel is flagged on line 9", () => {
  let b = acceptSuggestions(load(), 0.7);
  assert.ok(!scheduleC(b, { year: 2026 }).warnings.some((w) => /standard mileage rate is used instead/.test(w)));
  b = addTrip(b, { miles: 410, date: "2026-06-30", purpose: "driving" }).books;
  const sc = scheduleC(b, { year: 2026 });
  assert.ok(sc.warnings.some((w) => /Line 9 holds .* 297\.25/.test(w)), sc.warnings.join("\n"));
});

test("standard mileage next to booked insurance is flagged on line 15", () => {
  let b = acceptSuggestions(load(), 0.7);
  assert.ok(!scheduleC(b, { year: 2026 }).warnings.some((w) => /Line 15 holds/.test(w)));
  b = addTrip(b, { miles: 410, date: "2026-06-30", purpose: "driving" }).books;
  const sc = scheduleC(b, { year: 2026 });
  assert.ok(sc.warnings.some((w) => /Line 15 holds .*182\.00 of insurance/.test(w)), sc.warnings.join("\n"));
});
