import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkFeed, csvRows, parseTime, parseDate, formatDay, haversineM, contrastRatio, speedLimitKmh, validTimezone,
  findingsCsv, sampleFeed, sampleBrokenFeed, coverage,
} from "./calc.mjs";

const TODAY = "20261119";
const codes = (r) => r.findings.map((f) => f.code);
const find = (r, code, file) => r.findings.find((f) => f.code === code && (!file || f.file === file));
const withFiles = (patch) => {
  const f = { ...sampleFeed(), ...patch };
  for (const [k, v] of Object.entries(f)) if (v === null) delete f[k];
  return f;
};

// ---- Worked examples taken from the GTFS Schedule Reference itself.

test("reference, Field Types: Time accepts H:MM:SS and service-day times past 24:00", () => {
  // "Example: 14:30:00 for 2:30PM or 25:35:00 for 1:35AM on the next day."
  assert.equal(parseTime("14:30:00"), 14 * 3600 + 30 * 60);
  assert.equal(parseTime("25:35:00"), 25 * 3600 + 35 * 60);
  assert.equal(parseTime("6:00:00"), 6 * 3600); // "H:MM:SS is also accepted"
  assert.equal(parseTime("8:61:00"), null);
  assert.equal(parseTime("14:30"), null);
});

test("reference, Field Types: Date is YYYYMMDD and must be a real day", () => {
  // "Example: 20180913 for September 13th, 2018."
  assert.equal(formatDay(parseDate("20180913")), "20180913");
  assert.equal(parseDate("20180231"), null);
  assert.equal(parseDate("2018-09-13"), null);
});

test("reference, File Requirements: the quoted CSV example round-trips", () => {
  // Original value `Contains "quotes", commas and text`, written as
  // `"Contains ""quotes"", commas and text"`.
  const rows = [...csvRows('a,b\nx,"Contains ""quotes"", commas and text"\n')];
  assert.deepEqual(rows[1].cells, ["x", 'Contains "quotes", commas and text']);
});

test("reference, Field Types: Color example 0039A6 is valid, with a leading # it is not", () => {
  const ok = checkFeed(withFiles({ "routes.txt": "route_id,agency_id,route_short_name,route_type,route_color,route_text_color\n1,RVT,1,3,0039A6,FFFFFF\n" }), { today: TODAY });
  assert.ok(!codes(ok).includes("invalid_color"));
  const bad = checkFeed(withFiles({ "routes.txt": "route_id,agency_id,route_short_name,route_type,route_color\n1,RVT,1,3,#0039A6\n" }), { today: TODAY });
  assert.ok(codes(bad).includes("invalid_color"));
});

test("reference, trips.txt 'Blocks and service day': 24:00:00 to 24:55:00 is a valid trip", () => {
  const st = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n1-0700,24:00:00,24:00:00,DEPOT,1\n1-0700,24:55:00,24:55:00,MALL,2\n1-0800,08:00:00,08:00:00,DEPOT,1\n1-0800,08:12:00,08:12:00,MALL,2\n";
  const r = checkFeed(withFiles({ "stop_times.txt": st }), { today: TODAY });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
});

test("reference, Dataset Publishing: under 7 days left warns, under 30 notes, past is an error", () => {
  const cal = (end) => withFiles({ "calendar.txt": `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,${end}\n`, "feed_info.txt": null });
  assert.ok(codes(checkFeed(cal("20261123"), { today: TODAY })).includes("feed_expires_within_7_days"));
  assert.ok(codes(checkFeed(cal("20261210"), { today: TODAY })).includes("feed_covers_under_30_days"));
  const past = checkFeed(cal("20261118"), { today: TODAY });
  assert.equal(find(past, "feed_expired").severity, "error");
  assert.equal(past.stats.lastServiceDate, "20261118");
  const fine = checkFeed(cal("20270630"), { today: TODAY });
  assert.ok(!codes(fine).some((c) => c.startsWith("feed_")));
});

// ---- Hand calculations.

test("haversine: one degree of latitude is about 111.2 km", () => {
  // 2 * pi * 6371.0088 km / 360 = 111.195 km
  assert.ok(Math.abs(haversineM(0, 0, 1, 0) - 111195) < 5);
});

test("WCAG contrast: black on white is 21:1, a colour on itself is 1:1", () => {
  assert.ok(Math.abs(contrastRatio("000000", "FFFFFF") - 21) < 1e-9);
  assert.equal(contrastRatio("0039A6", "0039A6"), 1);
});

test("speed: 10 km in 2 minutes is 300 km/h, over a bus's 150 and under rail's 500", () => {
  const stops = "stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,45.0,-93.0\nB,Beta,45.0899322,-93.0\nC,Gamma,45.0,-92.99\nD,Delta,45.0,-92.98\nE,Echo,45.0,-92.97\n";
  const st = (t2) => `trip_id,arrival_time,departure_time,stop_id,stop_sequence\n1-0700,07:00:00,07:00:00,A,1\n1-0700,${t2},${t2},B,2\n1-0800,08:00:00,08:00:00,C,1\n1-0800,08:10:00,08:10:00,D,2\n`;
  const fast = checkFeed(withFiles({ "stops.txt": stops, "stop_times.txt": st("07:02:00"), "shapes.txt": null, "trips.txt": "route_id,service_id,trip_id\n1,WK,1-0700\n1,WK,1-0800\n" }), { today: TODAY });
  const f = find(fast, "too_fast");
  assert.ok(f, JSON.stringify(fast.findings));
  assert.match(f.examples[0].detail, /10\.0 km in 2 min = 300 km\/h/);
  const slow = checkFeed(withFiles({ "stops.txt": stops, "stop_times.txt": st("07:05:00"), "shapes.txt": null, "trips.txt": "route_id,service_id,trip_id\n1,WK,1-0700\n1,WK,1-0800\n" }), { today: TODAY });
  assert.ok(!find(slow, "too_fast"));
  assert.equal(speedLimitKmh("3"), 150);
  assert.equal(speedLimitKmh("2"), 500);
  assert.equal(speedLimitKmh("4"), 80);
});

test("coverage: a weekday-only calendar leaves weekends as gaps; removals take a day out", () => {
  const s = new Map([["WK", { inCal: true, used: true, start: parseDate("20261116"), end: parseDate("20261130"), week: [false, true, true, true, true, true, false], added: new Set(), removed: new Set([parseDate("20261126")]) }]]);
  const c = coverage(s, parseDate("20261119"));
  assert.equal(formatDay(c.last), "20261130");
  const gaps = c.gaps.map(formatDay);
  assert.deepEqual(gaps, ["20261121", "20261122", "20261126", "20261128", "20261129"]);
});

// ---- The examples the page offers.

test("the clean example has no errors or warnings", () => {
  const r = checkFeed(sampleFeed(), { today: TODAY });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.summary.warnings, 0, JSON.stringify(r.findings));
  assert.equal(r.stats.trips, 2);
  assert.equal(r.stats.daysWithServiceNext30, 30);
});

test("the broken example reports each planted problem", () => {
  const r = checkFeed(sampleBrokenFeed(), { today: TODAY });
  for (const c of ["invalid_timezone", "invalid_url", "stop_at_null_island", "stop_far_from_others", "invalid_color", "long_short_name", "low_color_contrast",
    "unknown_service", "unknown_reference", "departure_before_arrival", "time_goes_backwards", "missing_end_times", "stop_time_at_station", "invalid_time",
    "feed_expired", "all_caps_name", "unknown_field", "unused_stop", "unused_route"]) assert.ok(codes(r).includes(c), c);
  assert.deepEqual(find(r, "time_goes_backwards").examples[0], { line: 4, detail: "1-0700 #2 7:03:00 then #3 7:02:00" });
  assert.equal(find(r, "unknown_field").examples[0].detail, "drop_off_time");
  // The page says "seventeen kinds of problem": count the distinct error and warning codes.
  const kinds = new Set(r.findings.filter((f) => f.severity !== "info").map((f) => f.code));
  assert.equal(kinds.size, 17, [...kinds].join(", "));
});

// ---- Structure.

test("missing required files and a feed in a subfolder", () => {
  const r = checkFeed({ "gtfs/agency.txt": sampleFeed()["agency.txt"], "gtfs/routes.txt": sampleFeed()["routes.txt"] }, { today: TODAY });
  assert.ok(codes(r).includes("files_in_subfolder"));
  const missing = r.findings.filter((f) => f.code === "missing_required_file").map((f) => f.file).sort();
  assert.deepEqual(missing, ["stop_times.txt", "stops.txt", "trips.txt"]);
  assert.ok(codes(r).includes("missing_calendar"));
});

test("file and field names are case-sensitive", () => {
  const f = withFiles({ "Stops.txt": sampleFeed()["stops.txt"], "stops.txt": null });
  assert.ok(codes(checkFeed(f, { today: TODAY })).includes("file_name_case"));
  const g = withFiles({ "agency.txt": "Agency_Name,agency_url,agency_timezone\nX,https://x.org,UTC\n" });
  assert.ok(codes(checkFeed(g, { today: TODAY })).includes("header_case"));
});

test("too many values is an error; missing trailing values is a warning", () => {
  const many = withFiles({ "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\nRVT,River Valley, Transit,https://example.org,America/Chicago\n" });
  assert.equal(find(checkFeed(many, { today: TODAY }), "too_many_values").severity, "error");
  const few = withFiles({ "agency.txt": "agency_id,agency_name,agency_url,agency_timezone,agency_lang\nRVT,River Valley Transit,https://example.org,America/Chicago\n" });
  assert.equal(find(checkFeed(few, { today: TODAY }), "short_row").severity, "warning");
});

test("duplicate keys in stops, trips, stop_times and calendar_dates", () => {
  const f = withFiles({
    "stops.txt": sampleFeed()["stops.txt"] + "LIB,Library Again,41.8850,-87.6250,,\n",
    "trips.txt": sampleFeed()["trips.txt"] + "1,WK,1-0700,Valley Mall,0,S1\n",
    "stop_times.txt": sampleFeed()["stop_times.txt"] + "1-0800,08:13:00,08:13:00,MALL,4,1\n",
    "calendar_dates.txt": "service_id,date,exception_type\nWK,20261225,2\nWK,20261225,2\n",
  });
  const r = checkFeed(f, { today: TODAY });
  const files = r.findings.filter((x) => x.code === "duplicate_key").map((x) => x.file).sort();
  assert.deepEqual(files, ["calendar_dates.txt", "stop_times.txt", "stops.txt", "trips.txt"]);
});

test("a removal in calendar_dates inside the next 30 days shows as a no-service day", () => {
  const r = checkFeed(withFiles({ "calendar_dates.txt": "service_id,date,exception_type\nWK,20261126,2\n" }), { today: TODAY });
  assert.equal(find(r, "no_service_day").examples[0].detail, "2026-11-26");
  assert.equal(r.stats.daysWithServiceNext30, 29);
});

test("a calendar_dates-only feed counts its added dates", () => {
  const r = checkFeed(withFiles({ "calendar.txt": null, "calendar_dates.txt": "service_id,date,exception_type\nWK,20261120,1\nWK,20261121,1\n", "feed_info.txt": null }), { today: TODAY });
  assert.equal(r.stats.lastServiceDate, "20261121");
  assert.ok(codes(r).includes("feed_expires_within_7_days"));
  assert.ok(!codes(r).includes("missing_calendar"));
});

test("parent station rules: stations take no parent, boarding areas need a platform", () => {
  const stops = "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nDEPOT,Main Street Depot,41.88,-87.63,,\nLIB,Public Library,41.885,-87.625,,\nPARK,Riverside Park,41.89,-87.62,,STN2\nMALL,Valley Mall,41.895,-87.615,,\nSTN,Valley Station,41.895,-87.615,1,STN2\nSTN2,Other Station,41.895,-87.615,1,\nBA,Boarding Area A,41.895,-87.615,4,STN2\nEN,Entrance,41.895,-87.615,2,\n";
  const r = checkFeed(withFiles({ "stops.txt": stops }), { today: TODAY });
  for (const c of ["station_with_parent", "wrong_parent_type", "missing_parent_station"]) assert.ok(codes(r).includes(c), c);
});

test("frequencies: overlapping headways and end before start", () => {
  const r = checkFeed(withFiles({ "frequencies.txt": "trip_id,start_time,end_time,headway_secs\n1-0700,06:00:00,09:00:00,600\n1-0700,08:30:00,10:00:00,900\n1-0800,10:00:00,09:00:00,600\n" }), { today: TODAY });
  assert.ok(codes(r).includes("overlapping_frequencies"));
  assert.ok(codes(r).includes("end_before_start"));
});

test("feed_info end date before the last service date is flagged", () => {
  const fi = "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nRVT,https://example.org,en,20260101,20261231\n";
  const r = checkFeed(withFiles({ "feed_info.txt": fi }), { today: TODAY });
  assert.ok(codes(r).includes("feed_info_end_before_service"));
});

test("findings merge by code with a count, and examples are capped", () => {
  let st = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n";
  for (let i = 0; i < 50; i++) st += `1-0700,07:00:00,07:00:00,DEPOT,${2 * i + 1}\n1-0700,06:00:00,06:00:00,LIB,${2 * i + 2}\n`;
  st += "1-0800,08:00:00,08:00:00,DEPOT,1\n1-0800,08:12:00,08:12:00,MALL,2\n";
  const r = checkFeed(withFiles({ "stop_times.txt": st }), { today: TODAY });
  const f = find(r, "time_goes_backwards");
  assert.equal(f.count, 50);
  assert.equal(f.examples.length, 8);
});

test("values with spaces are reported, BOM is accepted", () => {
  const r = checkFeed(withFiles({ "agency.txt": "\uFEFFagency_id,agency_name,agency_url,agency_timezone\nRVT,River Valley Transit ,https://example.org/transit,America/Chicago\n" }), { today: TODAY });
  assert.ok(codes(r).includes("value_spaces"));
  assert.ok(!codes(r).includes("missing_required_field"));
});

test("time zones: IANA names pass, misspellings and spaces fail", () => {
  assert.ok(validTimezone("America/Los_Angeles"));
  assert.ok(!validTimezone("America/Chicgo"));
  assert.ok(!validTimezone("America/Los Angeles"));
});

test("CSV export guards spreadsheet formulas and keeps one row per example", () => {
  const csv = findingsCsv(checkFeed(sampleBrokenFeed(), { today: TODAY }));
  assert.match(csv, /^severity,code,file,count,line,detail,message\n/);
  assert.doesNotMatch(csv, /\n[^,\n]*,[^,\n]*,[^,\n]*,[^,\n]*,[^,\n]*,=/);
  const r = checkFeed(withFiles({ "stops.txt": sampleFeed()["stops.txt"] + "=HYPERLINK(1),Evil,41.9,-87.6,,\n" }), { today: TODAY });
  assert.match(findingsCsv(r), /'=HYPERLINK/);
});

test("a header or file named after an Object.prototype key is not taken as a known one", () => {
  const r = checkFeed(withFiles({ "agency.txt": "agency_id,agency_name,agency_url,agency_timezone,constructor\nRVT,River Valley Transit,https://example.org/transit,America/Chicago,x\n", "toString": "a\n1\n" }), { today: TODAY });
  const unknown = r.findings.filter((f) => f.code === "unknown_field" || f.code === "unknown_file").map((f) => f.examples[0].detail).sort();
  assert.deepEqual(unknown, ["constructor", "toString"]);
});

test("the 7-day line is exact: service through day 6 warns, through day 7 does not", () => {
  const cal = (end) => withFiles({ "calendar.txt": `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,${end}\n`, "feed_info.txt": null });
  assert.ok(codes(checkFeed(cal("20261125"), { today: TODAY })).includes("feed_expires_within_7_days"));
  const seven = codes(checkFeed(cal("20261126"), { today: TODAY }));
  assert.ok(!seven.includes("feed_expires_within_7_days") && seven.includes("feed_covers_under_30_days"));
});

test("a stop 150 km from a 1 km cluster is flagged as far from the others", () => {
  // 0.009 degrees of latitude is about 1 km; 1.35 degrees is about 150 km.
  const stops = "stop_id,stop_name,stop_lat,stop_lon\nDEPOT,Main Street Depot,41.880,-87.630\nLIB,Public Library,41.885,-87.630\nPARK,Riverside Park,41.889,-87.630\nMALL,Valley Mall,41.884,-87.625\nX1,Extra One,41.882,-87.628\nFAR,Far Away,43.230,-87.630\n";
  const r = checkFeed(withFiles({ "stops.txt": stops }), { today: TODAY });
  const f = find(r, "stop_far_from_others");
  assert.ok(f, JSON.stringify(r.findings));
  assert.match(f.examples[0].detail, /^FAR is 150 km/);
});

test("first and last service dates are the calendar's own, even outside the walked window", () => {
  const r = checkFeed(sampleBrokenFeed(), { today: TODAY });
  assert.equal(r.stats.firstServiceDate, "20240101"); // a Monday, and WK runs Monday-Friday
  assert.equal(r.stats.lastServiceDate, "20241231");
});

test("CSV export lets plain negative numbers through untouched", () => {
  const csv = findingsCsv({ findings: [{ severity: "info", code: "x", file: "f", count: 1, message: "m", examples: [{ line: 1, detail: "-12.50" }, { line: 2, detail: "+cmd" }] }] });
  assert.match(csv, /,-12\.50,/);
  assert.match(csv, /,'\+cmd,/);
});
