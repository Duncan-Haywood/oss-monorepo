// All fixtures below are SYNTHETIC (invented vendors, ids and amounts) so the
// tests pin behaviour, not any real contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAwards, parseCsv, parseDate, parseMoney, analyze, hhi, median, quantile,
  readConcentration, buildRequest, recompetesToCsv, money, monthsBetween,
} from "./calc.mjs";

const TODAY = new Date(Date.UTC(2026, 9, 16));

const api = (over = {}) => ({
  "Award ID": "SYN0001", "Recipient Name": "ACME FACILITY SERVICES LLC", "Award Amount": 1_200_000,
  "Start Date": "2024-01-01", "End Date": "2027-01-01", "Awarding Agency": "Department of Synthetic Affairs",
  "Awarding Sub Agency": "Office of Examples", Description: "JANITORIAL SERVICES", ...over,
});

test("parseDate handles ISO, US, timestamps and rejects rolled-over dates", () => {
  assert.equal(parseDate("2027-03-31").toISOString().slice(0, 10), "2027-03-31");
  assert.equal(parseDate("3/5/2027").toISOString().slice(0, 10), "2027-03-05");
  assert.equal(parseDate("2027-03-31T00:00:00").toISOString().slice(0, 10), "2027-03-31");
  assert.equal(parseDate("2027-02-31"), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(undefined), null);
});

test("parseMoney handles symbols, commas, parentheses and junk", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(500)"), -500);
  assert.equal(parseMoney(42), 42);
  assert.equal(parseMoney("n/a"), null);
  assert.equal(parseMoney(""), null);
});

test("normalizeAwards maps API field names and drops unusable rows, counting them", () => {
  const { awards, dropped } = normalizeAwards([api(), api({ "End Date": null }), api({ "Recipient Name": "" }), null, api({ "Award Amount": "x" })]);
  assert.equal(awards.length, 1);
  assert.equal(dropped, 4);
  assert.equal(awards[0].vendor, "ACME FACILITY SERVICES LLC");
  assert.equal(awards[0].end.toISOString().slice(0, 10), "2027-01-01");
});

test("normalizeAwards also reads USAspending download-CSV column names", () => {
  const csv = [
    "award_id_piid,recipient_name,total_dollars_obligated,period_of_performance_start_date,period_of_performance_current_end_date,awarding_agency_name,awarding_sub_agency_name,award_description,naics_code,type_of_set_aside",
    'SYN0002,"SMITH, JONES & CO",250000,2025-02-01,2027-02-01,Dept of Synthetic Affairs,Office of Examples,"CLEANING ""BLDG 4""",561720,SBA',
  ].join("\r\n");
  const { awards } = normalizeAwards(parseCsv(csv));
  assert.equal(awards.length, 1);
  assert.equal(awards[0].vendor, "SMITH, JONES & CO");
  assert.equal(awards[0].description, 'CLEANING "BLDG 4"');
  assert.equal(awards[0].naics, "561720");
  assert.equal(awards[0].setAside, "SBA");
});

test("parseCsv ignores BOM and blank lines and returns [] for header-only input", () => {
  assert.deepEqual(parseCsv("﻿a,b\n\n1,2\n"), [{ a: "1", b: "2" }]);
  assert.deepEqual(parseCsv("a,b\n"), []);
  assert.deepEqual(parseCsv(""), []);
});

test("analyze sorts recompetes by end date and assigns stages relative to today", () => {
  const { awards } = normalizeAwards([
    api({ "Award ID": "late", "End Date": "2027-12-01" }),
    api({ "Award ID": "now", "End Date": "2026-12-01" }),
    api({ "Award ID": "mid", "End Date": "2027-04-01" }),
    api({ "Award ID": "past", "End Date": "2026-01-01" }),
    api({ "Award ID": "far", "End Date": "2031-01-01" }),
  ]);
  const r = analyze(awards, { today: TODAY, windowMonths: 18, leadMonths: 9 });
  assert.deepEqual(r.recompetes.map((a) => a.id), ["now", "mid", "late"]);
  assert.equal(r.alreadyEnded, 1);
  assert.equal(r.beyondWindow, 1);
  assert.match(r.recompetes[0].stage, /ending now/);
  assert.match(r.recompetes[1].stage, /solicitation window/);
  assert.match(r.recompetes[2].stage, /early/);
});

test("annual value divides by performance years; missing start gives null, not a guess", () => {
  const { awards } = normalizeAwards([
    api({ "Award Amount": 3_000_000, "Start Date": "2024-01-01", "End Date": "2027-01-01" }),
    api({ "Award ID": "nostart", "Start Date": "", "End Date": "2027-01-01" }),
  ]);
  const r = analyze(awards, { today: TODAY });
  const a = r.recompetes.find((x) => x.id === "SYN0001");
  assert.ok(Math.abs(a.annualValue - 1_000_000) < 5_000);
  assert.equal(r.recompetes.find((x) => x.id === "nostart").annualValue, null);
});

test("minValue filters before everything else", () => {
  const { awards } = normalizeAwards([api({ "Award Amount": 10_000 }), api({ "Award ID": "b", "Award Amount": 900_000 })]);
  const r = analyze(awards, { today: TODAY, minValue: 100_000 });
  assert.equal(r.considered, 1);
  assert.equal(r.recompetes.length, 1);
});

test("hhi: monopoly 10000, four equal vendors 2500, ignores non-positive dollars", () => {
  assert.equal(hhi(new Map([["a", 5]])), 10000);
  assert.equal(hhi(new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1]])), 2500);
  assert.equal(hhi(new Map([["a", 1], ["b", -50]])), 10000);
  assert.equal(hhi(new Map()), null);
});

test("concentration reading uses 1,000 and 1,800 cut-offs", () => {
  assert.match(readConcentration(999), /fragmented/);
  assert.match(readConcentration(1000), /moderately/);
  assert.match(readConcentration(1800), /highly/);
  assert.equal(readConcentration(null), "not enough data");
});

test("vendor ranking counts a vendor's expiring awards", () => {
  const { awards } = normalizeAwards([
    api({ "Award ID": "1", "Recipient Name": "BIG CO", "Award Amount": 9_000_000, "End Date": "2027-03-01" }),
    api({ "Award ID": "2", "Recipient Name": "BIG CO", "Award Amount": 1_000_000, "End Date": "2030-03-01" }),
    api({ "Award ID": "3", "Recipient Name": "SMALL CO", "Award Amount": 1_000_000, "End Date": "2027-03-01" }),
  ]);
  const r = analyze(awards, { today: TODAY });
  assert.equal(r.topVendors[0].name, "BIG CO");
  assert.equal(r.topVendors[0].awards, 2);
  assert.equal(r.topVendors[0].expiring, 1);
  assert.ok(Math.abs(r.topVendors[0].share - 10 / 11) < 1e-9);
});

test("quantiles and median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(median([]), null);
});

test("analyze on nothing returns zeros, not NaN", () => {
  const r = analyze([], { today: TODAY });
  assert.equal(r.considered, 0);
  assert.equal(r.concentration, null);
  assert.equal(r.top3Share, null);
  assert.deepEqual(r.recompetes, []);
});

test("buildRequest validates input and shapes the filters", () => {
  const body = buildRequest({ naics: "561-720", state: "co", setAsides: ["SBA"], today: TODAY });
  assert.deepEqual(body.filters.naics_codes, ["561720"]);
  assert.deepEqual(body.filters.place_of_performance_locations, [{ country: "USA", state: "CO" }]);
  assert.deepEqual(body.filters.set_aside_type_codes, ["SBA"]);
  assert.equal(body.filters.time_period[0].start_date, "2023-10-16");
  assert.equal(body.limit, 100);
  assert.throws(() => buildRequest({ naics: "5" }), /NAICS/);
  assert.throws(() => buildRequest({ naics: "561720", state: "Colorado" }), /State/);
  assert.equal("place_of_performance_locations" in buildRequest({ naics: "56" }).filters, false);
});

test("CSV export neutralises formula cells and quotes commas", () => {
  const { awards } = normalizeAwards([api({ Description: "=HYPERLINK(\"x\")", "Recipient Name": "A, B" })]);
  const csv = recompetesToCsv(analyze(awards, { today: TODAY }).recompetes);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"A, B"/);
  assert.equal(csv.split("\n").length, 2);
});

test("money and monthsBetween", () => {
  assert.equal(money(1_250_000), "$1.25M");
  assert.equal(money(null), "n/a");
  assert.equal(money(-5000), "-$5K");
  assert.ok(Math.abs(monthsBetween(TODAY, new Date(Date.UTC(2027, 9, 16))) - 12) < 0.1);
});
