import { test } from "node:test";
import assert from "node:assert/strict";
import { rateFor, tripMiles, validateTrip, normalizeTrip, summarize, audit, haversineMiles, addFix, toCsv, exportJson, importJson, sampleTrips } from "./calc.mjs";

const T = (o) => normalizeTrip({ date: "2026-03-01", category: "business", to: "Client", purpose: "Visit", miles: 10, enteredAt: "2026-03-01T12:00:00Z", ...o });

test("the 2026 business rate changes on July 1", () => {
  assert.equal(rateFor("2026-06-30", "business"), 0.725);
  assert.equal(rateFor("2026-07-01", "business"), 0.76);
  assert.equal(rateFor("2025-12-31", "business"), 0.70);
  assert.equal(rateFor("2026-03-01", "charity"), 0.14);
  assert.equal(rateFor("2026-03-01", "commute"), 0);
  assert.equal(rateFor("2026-03-01", "business", { business: 0.5 }), 0.5);
});

test("odometer readings win over the typed miles; a bad pair falls back", () => {
  assert.equal(tripMiles({ odoStart: 1000, odoEnd: 1012.4, miles: 99 }), 12.4);
  assert.equal(tripMiles({ odoStart: 1000, odoEnd: 990, miles: 5 }), 5);
  assert.equal(tripMiles({ odoStart: "", odoEnd: "", miles: 7 }), 7);
});

test("a deductible trip needs a destination and purpose; a personal one does not", () => {
  assert.equal(validateTrip(T({ purpose: "" })).ok, false);
  assert.equal(validateTrip(T({ to: "" })).ok, false);
  assert.equal(validateTrip(T({ category: "personal", to: "", purpose: "" })).ok, true);
  assert.equal(validateTrip(T({ miles: 0 })).ok, false);
  assert.equal(validateTrip(T({ date: "" })).ok, false);
});

test("deduction is priced per trip date, so a year that straddles July 1 is split", () => {
  const trips = [T({ date: "2026-06-30", miles: 100 }), T({ date: "2026-07-01", miles: 100 })];
  const { summary: s } = summarize(trips, { year: 2026 });
  assert.equal(Math.round(s.by.business.deduction * 100), 7250 + 7600);
});

test("tolls and parking on business trips are added on top; on other trips they are not", () => {
  const trips = [T({ tolls: 5, parking: 10 }), T({ category: "medical", tolls: 50 })];
  const { summary: s } = summarize(trips, { year: 2026 });
  assert.equal(s.tolls, 5);
  assert.equal(s.parking, 10);
});

test("with year odometers the split, business use and unlogged miles reconcile", () => {
  const trips = [T({ miles: 1000 }), T({ category: "commute", to: "", purpose: "", miles: 500 })];
  const { summary: s } = summarize(trips, { year: 2026, yearStartOdo: 10000, yearEndOdo: 14000 });
  assert.equal(s.yearMiles, 4000);
  assert.equal(s.unlogged, 2500);
  assert.equal(s.otherMiles, 2500);          // 4000 - 1000 business - 500 commuting
  assert.equal(s.businessUse, 0.25);
});

test("years are separate", () => {
  const { summary: s } = summarize([T({ date: "2025-05-01" }), T({ date: "2026-05-01" })], { year: 2025 });
  assert.equal(s.trips, 1);
});

test("audit: missing purpose, bad odometer, duplicates, round numbers, late entry", () => {
  const trips = [
    T({ purpose: "" }),
    T({ odoStart: 500, odoEnd: 400, miles: 5, date: "2026-03-02" }),
    T({ date: "2026-03-03" }), T({ date: "2026-03-03" }),
    ...Array.from({ length: 12 }, (_, i) => T({ date: `2026-04-${String(i + 1).padStart(2, "0")}`, miles: 10, enteredAt: "2026-09-01T00:00:00Z" })),
  ];
  const { findings } = summarize(trips, { year: 2026 });
  const titles = findings.map((f) => f.title).join("|");
  assert.match(titles, /missing a purpose/);
  assert.match(titles, /odometer end at or below/);
  assert.match(titles, /possible duplicate/);
  assert.match(titles, /round numbers/);
  assert.match(titles, /entered more than 30 days after/);
});

test("audit: business miles above the odometer total is flagged", () => {
  const { findings } = summarize([T({ miles: 5000 })], { year: 2026, yearStartOdo: 0, yearEndOdo: 1000 });
  assert.ok(findings.some((f) => /higher than all miles driven/.test(f.title)));
});

test("haversine and the GPS accumulator ignore jitter and poor fixes", () => {
  const a = { lat: 40.0, lon: -75.0 }, b = { lat: 40.0, lon: -74.9 };
  const d = haversineMiles(a, b);
  assert.ok(d > 5 && d < 6);
  let t = addFix({}, { ...a, accuracy: 10 });
  t = addFix(t, { lat: 40.00001, lon: -75.0, accuracy: 10 });         // jitter
  t = addFix(t, { ...b, accuracy: 500 });                              // poor fix
  assert.equal(t.miles, 0);
  t = addFix(t, { ...b, accuracy: 10 });
  assert.ok(Math.abs(t.miles - d) < 1e-9);
});

test("csv escapes quotes and prices each row", () => {
  const csv = toCsv([T({ purpose: 'Bid "big" job', date: "2026-08-01", miles: 10 })]);
  const row = csv.split("\n")[1];
  assert.match(row, /"Bid ""big"" job"/);
  assert.match(row, /,0\.76,7\.6,/);
});

test("import merges by id, never drops, and rejects garbage", () => {
  const existing = [T({ id: "a" })];
  const json = exportJson([T({ id: "a" }), T({ id: "b", date: "2026-04-01" })]);
  const r = importJson(json, existing);
  assert.equal(r.added, 1);
  assert.equal(r.trips.length, 2);
  assert.match(importJson("nope", existing).error, /not valid JSON/);
  assert.match(importJson("{}", existing).error, /No trips/);
});

test("the example year produces the headline findings", () => {
  const s = sampleTrips(2026);
  const r = summarize(s.trips, { year: 2026, yearStartOdo: s.yearStartOdo, yearEndOdo: s.yearEndOdo });
  assert.ok(r.summary.mileageDeduction > 400);
  assert.ok(r.summary.businessUse > 0.1 && r.summary.businessUse < 0.9);
  assert.ok(r.findings.some((f) => /missing a purpose/.test(f.title)));
});

import { summarizeByVehicle, vehicleNames, frequentRoutes, tripFromRoute, preparerReportHtml, NO_VEHICLE } from "./calc.mjs";

test("vehicles are kept apart: miles, deduction and business use per car", () => {
  const trips = [
    T({ vehicle: "Truck", miles: 100 }), T({ vehicle: "Truck", miles: 50, category: "commute", to: "", purpose: "" }),
    T({ vehicle: "Van", miles: 40, date: "2026-07-02" }), T({ miles: 5 }),
  ];
  const v = summarizeByVehicle(trips, { year: 2026, vehicleOdo: { Truck: { start: 1000, end: 1500 } } });
  const truck = v.find((x) => x.vehicle === "Truck"), van = v.find((x) => x.vehicle === "Van");
  assert.equal(truck.business, 100); assert.equal(truck.commute, 50);
  assert.equal(truck.yearMiles, 500); assert.equal(truck.businessUse, 0.2); assert.equal(truck.unlogged, 350);
  assert.equal(van.deduction, 30.4);
  assert.ok(v.some((x) => x.vehicle === NO_VEHICLE));
  assert.deepEqual(vehicleNames(trips), ["Truck", "Van"]);
  assert.equal(summarizeByVehicle(trips, { year: 2025 }).length, 0);
});

test("vehicle survives normalize, CSV and JSON round trip", () => {
  const t = T({ vehicle: " Van " });
  assert.equal(t.vehicle, "Van");
  assert.match(toCsv([t]).split("\n")[0], /vehicle$/);
  assert.match(toCsv([t]).split("\n")[1], /"Van"$/);
  const back = importJson(exportJson([t]), []);
  assert.equal(back.trips[0].vehicle, "Van");
});

test("frequent routes rank by recurrence, use the median miles, and skip one-offs and personal trips", () => {
  const mk = (to, miles, date, extra = {}) => T({ from: "Home", to, miles, date, purpose: "Visit " + to, ...extra });
  const trips = [mk("Supplier", 10, "2026-01-01"), mk("Supplier", 12, "2026-02-01"), mk("Supplier", 11, "2026-03-01"),
    mk("Bank", 3, "2026-01-02"), mk("Bank", 3, "2026-01-09"), mk("One-off", 50, "2026-01-03"),
    mk("Gym", 2, "2026-01-04", { category: "personal" }), mk("Gym", 2, "2026-01-05", { category: "personal" })];
  const r = frequentRoutes(trips);
  assert.deepEqual(r.map((x) => x.to), ["Supplier", "Bank"]);
  assert.equal(r[0].miles, 11); assert.equal(r[0].count, 3);
  const d = tripFromRoute(r[0], "2026-04-01");
  assert.equal(d.date, "2026-04-01"); assert.equal(d.odoStart, ""); assert.equal(validateTrip(d).ok, true);
});

test("preparer report is standalone, escapes user text and lists vehicles and gaps", () => {
  const trips = [T({ vehicle: "Van", to: "<script>x</script>", purpose: "A & B", odoStart: 100, odoEnd: 110 }), T({ purpose: "" })];
  const html = preparerReportHtml(trips, { year: 2026, generated: "2026-12-31" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;") && html.includes("A &amp; B"));
  assert.ok(html.includes("Van") && html.includes("Gaps in this log") && html.includes("Prepared 2026-12-31"));
  assert.ok(!/<script|src=|href=/.test(html));
});
