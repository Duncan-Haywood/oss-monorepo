import { test } from "node:test";
import assert from "node:assert/strict";
import { isTripLog, parseTrips, mergeTrips, summarizeTrips, tripNotes, isoDate, sampleTripCsv } from "./trips.mjs";
import { buildBooks, sampleFiles, toCsv, summaryText, detectKind } from "./books.mjs";
import { toCsv as mileageLogCsv, sampleTrips } from "./engines/mileage.mjs";

test("the sample log: 102.1 business miles at 72.5c plus $11.50 tolls and parking", () => {
  const s = summarizeTrips(parseTrips(sampleTripCsv()).trips);
  assert.equal(s.businessTrips, 7);
  assert.equal(s.businessMiles, 102.1);
  assert.equal(s.otherMiles, 3);
  assert.equal(s.deduction, 74.02); // 102.1 x 0.725 = 74.0225
  assert.equal(s.tolls, 4.5);
  assert.equal(s.parking, 7);
  assert.equal(s.carTruck, 85.52);
  assert.deepEqual(s.months.map((m) => [m.month, m.miles]), [["2026-01", 47.6], ["2026-02", 36.6], ["2026-03", 17.9]]);
});

test("the 2026 rate changes on July 1 (Announcement 2026-11)", () => {
  const csv = "date,miles,to,purpose\n2026-06-30,100,Post office,Ship\n2026-07-01,100,Post office,Ship\n";
  const s = summarizeTrips(parseTrips(csv).trips);
  assert.equal(s.deduction, 72.5 + 76);
  assert.deepEqual(s.rates, [0.725, 0.76]);
});

test("a log with no category column is a business log; a category column is respected", () => {
  assert.equal(parseTrips("date,miles\n2026-02-01,10\n").trips[0].category, "business");
  const t = parseTrips("date,type,miles\n2026-02-01,Commute,10\n2026-02-02,Sourcing,5\n2026-02-03,,4\n2026-02-04,errand,2\n").trips;
  assert.deepEqual(t.map((x) => x.category), ["commute", "business", "personal", "personal"]);
  const s = summarizeTrips(t);
  assert.equal(s.businessMiles, 5);
  assert.equal(s.commuteMiles, 10);
  assert.match(tripNotes(s).join(" "), /10 commuting miles are counted for Schedule C Part IV but not deducted/);
});

test("odometer readings give the miles when there is no miles column", () => {
  const csv = "Date,Odometer Start,Odometer End,Destination,Purpose\n3/4/2026,10200,10212.5,Thrift store,Sourcing\n";
  assert.ok(isTripLog(csv));
  const t = parseTrips(csv).trips[0];
  assert.equal(t.date, "2026-03-04");
  assert.equal(summarizeTrips([t]).businessMiles, 12.5);
});

test("the mileage-log venture's own CSV export is read as it is written", () => {
  const { trips } = sampleTrips(2026);
  const csv = mileageLogCsv(trips);
  assert.equal(detectKind(csv), "mileage");
  const parsed = parseTrips(csv).trips;
  assert.equal(parsed.length, trips.length);
  const biz = trips.filter((t) => t.category === "business");
  assert.equal(parsed.filter((t) => t.category === "business").length, biz.length);
});

test("overlapping downloads count a trip once; two identical trips in one file both count", () => {
  const a = "date,miles,to,purpose\n2026-01-05,5.1,Post office,Ship\n2026-01-05,5.1,Post office,Ship\n2026-01-09,20,Thrift,Source\n";
  const b = "date,miles,to,purpose\n2026-01-09,20,Thrift,Source\n2026-01-12,8,Estate sale,Source\n";
  const m = mergeTrips([{ name: "a.csv", text: a }, { name: "b.csv", text: b }]);
  assert.equal(m.trips.length, 4);
  assert.equal(m.repeatsDropped, 1);
  assert.equal(summarizeTrips(m.trips).businessMiles, 38.2);
});

test("trips the rate table cannot price are left out or flagged, not guessed", () => {
  const s = summarizeTrips(parseTrips("date,miles,to,purpose\n2024-12-31,10,A,B\n2027-01-02,10,A,B\n2026-05-01,10,,\n").trips);
  assert.equal(s.unpriced, 1);
  assert.equal(s.businessMiles, 20);
  const notes = tripNotes(s).join(" ");
  assert.match(notes, /before 2025-01-01/);
  assert.match(notes, /after 2026-12-31/);
  assert.match(notes, /no destination or no purpose/);
});

test("unreadable rows are skipped and counted; dates in US format are read", () => {
  assert.equal(isoDate("12/31/25"), "2025-12-31");
  assert.equal(isoDate("not a date"), "");
  const r = parseTrips("date,miles\nsoon,5\n2026-01-01,abc\n2026-01-02,3\n");
  assert.equal(r.trips.length, 1);
  assert.equal(r.skipped, 2);
});

test("in the books: line 9 and Part IV rows, profit after the car, CSV and summary", () => {
  const s = sampleFiles();
  const r = buildBooks(s.files, { costs: s.costs });
  assert.equal(r.channels.length, 6, "a trip log is not a sales channel");
  assert.equal(r.mileage.carTruck, 85.52);
  const line9 = r.schedule.find((x) => x.line === "9");
  assert.equal(line9.amount, 85.52);
  assert.match(line9.note, /72\.5¢/);
  assert.equal(r.schedule.find((x) => x.line === "Part IV 44a").miles, 102.1);
  if (r.total.profit !== null) assert.equal(r.total.profitAfterCar, Math.round((r.total.profit - 85.52) * 100) / 100);
  const csv = toCsv(r);
  assert.match(csv, /"9","Car and truck expenses \(standard mileage rate\)",85\.52/);
  assert.match(csv, /mileage_month,business_miles/);
  assert.match(summaryText(r), /102\.1 business miles, car and truck expenses \$85\.52/);
  // The marketplace reconciliation is untouched by the mileage.
  const without = buildBooks(s.files.filter((f) => f.name !== "mileage-log.csv"), { costs: s.costs });
  assert.equal(without.total.net, r.total.net);
  assert.equal(without.mileage, null);
  assert.equal(without.schedule.length + 2, r.schedule.length);
});

test("a mileage log alone says to add the marketplace reports", () => {
  const r = buildBooks([{ name: "trips.csv", text: sampleTripCsv() }]);
  assert.match(r.invalid, /mileage log was read, but no marketplace file/);
});
