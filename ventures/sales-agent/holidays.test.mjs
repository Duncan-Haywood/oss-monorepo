import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usFederalHolidays, usBusinessHolidays, gbBankHolidays, easter, holidayChecker, caFederalHolidays, caProvincialHolidays, upcomingHolidays } from "./holidays.mjs";
import { addBusinessDays, businessDaysBetween } from "./engine.mjs";

// Pinned from the rules (fixed dates moved off weekends; nth-weekday ones counted). 2026: July 4 is a Saturday, so
// Friday July 3 is observed. 2027: June 19 and December 25 are Saturdays, July 4 a Sunday; New Year's Day 2028 is a
// Saturday, so it is observed on Friday 2027-12-31.
test("US federal holidays, 2026 and 2027, with the weekend rule", () => {
  assert.deepEqual(usFederalHolidays(2026).map((h) => h.date), ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]);
  assert.deepEqual(usFederalHolidays(2027).map((h) => h.date), ["2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24"]);
  assert.equal(usFederalHolidays(2028)[0].date, "2027-12-31");
  assert.deepEqual(usBusinessHolidays(2026).map((h) => h.name), ["New Year's Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"]);
});

test("holidayChecker: presets, dates and mixes; the year-before observed day; bad input throws", () => {
  const us = holidayChecker("us");
  assert.ok(us("2026-11-26") && us("2026-07-03") && !us("2026-07-04") && !us("2026-11-27"));
  assert.ok(us("2027-12-31"), "New Year's Day 2028 observed in 2027");
  const biz = holidayChecker("us-business, 2026-11-27");
  assert.ok(biz("2026-11-26") && biz("2026-11-27") && !biz("2026-10-12"), "Columbus Day is not a business holiday");
  assert.ok(holidayChecker(["2026-12-24"])("2026-12-24"));
  assert.equal(holidayChecker("")("2026-12-25"), false);
  assert.throws(() => holidayChecker("fr"), /not a date/);
});

test("business days skip holidays when given, weekends always", () => {
  const us = holidayChecker("us");
  assert.equal(addBusinessDays("2026-11-25", 1), "2026-11-26", "no list: Thanksgiving counts");
  assert.equal(addBusinessDays("2026-11-25", 1, us), "2026-11-27");
  assert.equal(addBusinessDays("2026-12-24", 1, us), "2026-12-28", "Christmas Friday, then the weekend");
  assert.equal(businessDaysBetween("2026-10-28", "2026-10-30"), 2);
  assert.equal(businessDaysBetween("2026-11-25", "2026-11-30", us), 2, "Thanksgiving skipped: Friday and Monday");
  assert.equal(businessDaysBetween("2026-10-30", "2026-10-28"), 0);
});

// GOV.UK's own list (https://www.gov.uk/bank-holidays.json, fetched 2026-11-12; Open Government Licence v3.0): every
// date for 2019-2028 in all three divisions must come out of the rules plus the listed one-offs, and nothing extra.
test("UK bank holidays match GOV.UK's list, 2019-2028, all three divisions", () => {
  const gov = JSON.parse(readFileSync(new URL("./fixtures/gov-uk-bank-holidays-2026-11-12.json", import.meta.url), "utf8"));
  const divs = { "england-and-wales": "eng", scotland: "sct", "northern-ireland": "nir" };
  let n = 0;
  for (const [key, div] of Object.entries(divs)) {
    for (let y = 2019; y <= 2028; y++) {
      const want = gov[key].events.filter((e) => e.date.startsWith(`${y}-`)).map((e) => e.date).sort();
      assert.deepEqual(gbBankHolidays(y, div).map((h) => h.date), want, `${key} ${y}`);
      n += want.length;
    }
  }
  assert.equal(n, 280);
});

test("Easter and the UK presets in the checker", () => {
  assert.deepEqual(easter(2026), [3, 5]);
  assert.deepEqual(easter(2038), [3, 25], "latest possible Easter");
  assert.deepEqual(easter(2285), [2, 22], "earliest possible Easter");
  const eng = holidayChecker("gb"), sct = holidayChecker("gb-sct"), nir = holidayChecker("gb-nir, 2026-12-24");
  assert.ok(eng("2026-04-06") && !sct("2026-04-06"), "Easter Monday is not a Scottish bank holiday");
  assert.ok(sct("2026-08-03") && !eng("2026-08-03") && eng("2026-08-31"), "Scotland's summer holiday is the first Monday");
  assert.ok(nir("2026-03-17") && nir("2026-07-13") && nir("2026-12-24"), "St Patrick's; the Boyne substitute Monday; a typed date");
  assert.ok(sct("2027-01-04") && sct("2027-01-01"), "1 Jan Friday, 2 Jan Saturday: substitute Monday");
  assert.ok(eng("2027-12-27") && eng("2027-12-28"), "Christmas Saturday and Boxing Day Sunday: Monday and Tuesday");
  assert.equal(holidayChecker("uk")("2026-12-28"), true, "Boxing Day 2026 is a Saturday");
  assert.equal(addBusinessDays("2026-04-02", 1, eng), "2026-04-07", "Thursday before Easter, then Tuesday");
  assert.equal(addBusinessDays("2026-04-02", 1, sct), "2026-04-06", "Scotland works Easter Monday");
});

// Canada against canada-holidays.ca's federal list (fixtures/canada-federal-holidays.json, fetched 2026-11-12): an
// open-source site, not the Government of Canada, whose pages timed out from this host. 85 observed dates, 2022-2028.
test("ca matches the federal holidays canada-holidays.ca lists, 2022-2028", () => {
  const ca = JSON.parse(readFileSync(new URL("./fixtures/canada-federal-holidays.json", import.meta.url), "utf8")).years;
  for (const [y, want] of Object.entries(ca)) assert.deepEqual(caFederalHolidays(Number(y)).map((h) => h.date), [...want].sort(), `ca ${y}`);
  const ca1 = holidayChecker("ca");
  assert.ok(ca1("2028-07-03") && !ca1("2028-06-30"), "Canada Day on a Saturday moves to Monday, not Friday as in the US");
  assert.equal(addBusinessDays("2026-06-30", 1, ca1), "2026-07-02");
});

test("upcomingHolidays: the next days off with names, dates included, across the year end", () => {
  assert.deepEqual(upcomingHolidays("gb-eng, 2026-12-24", "2026-12-01", 3), [{ date: "2026-12-24", name: "day off" }, { date: "2026-12-25", name: "Christmas Day" }, { date: "2026-12-28", name: "Boxing Day (substitute day)" }]);
  assert.deepEqual(upcomingHolidays("us-business", "2026-12-26", 2).map((h) => h.date), ["2027-01-01", "2027-05-31"]);
  assert.deepEqual(upcomingHolidays("", "2026-12-26"), []);
  assert.throws(() => upcomingHolidays("fr", "2026-12-26"), /not a date/);
});

// Provinces and territories against canada-holidays.ca's provincial lists (fixtures/canada-provincial-holidays.json,
// fetched 2026-11-12; each province's entry names the government page the site cites). 13 x 7 years, 855 dates.
test("ca-xx matches the provincial and territorial holidays canada-holidays.ca lists, 2022-2028", () => {
  const f = JSON.parse(readFileSync(new URL("./fixtures/canada-provincial-holidays.json", import.meta.url), "utf8")).provinces;
  let n = 0;
  for (const [p, years] of Object.entries(f)) for (const [y, want] of Object.entries(years)) {
    if (!/^\d{4}$/.test(y)) continue;
    assert.deepEqual(caProvincialHolidays(Number(y), p).map((h) => h.date), want.map((x) => x[0]).sort(), `${p} ${y}`);
    n += want.length;
  }
  assert.equal(n, 855);
  const qc = holidayChecker("ca-qc"), on = holidayChecker("ca-on"), nl = holidayChecker("CA-NL");
  assert.ok(qc("2026-06-24") && !on("2026-06-24"), "Saint-Jean-Baptiste is Quebec's");
  assert.ok(on("2026-02-16") && !qc("2026-02-16"), "Family Day is Ontario's, not Quebec's");
  assert.ok(on("2026-12-28") && !qc("2026-12-28"), "Ontario keeps Boxing Day (a Saturday in 2026) on Monday");
  assert.ok(nl("2027-03-15") && nl("2026-08-05"), "NL: St Patrick's nearest Monday; Regatta Day, first Wednesday of August");
  assert.equal(addBusinessDays("2026-06-23", 1, qc), "2026-06-25");
  assert.throws(() => holidayChecker("ca-xx"), /province/);
  assert.throws(() => caProvincialHolidays(2026, "zz"), /unknown province/);
});
