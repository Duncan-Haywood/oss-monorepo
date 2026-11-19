import { test } from "node:test";
import assert from "node:assert/strict";
import { importDeputyStaff, fetchDeputyStaff, looksLikeDeputyStaff } from "./import-deputy-staff.mjs";
import { looksLikeDeputy } from "./import-deputy.mjs";
import { parseStaff } from "./calc.mjs";

// Invented rows in the shape of Deputy's Employee, EmployeeAgreement, EmployeeWorkplace and Company resources (field
// names from the MIT communityds/deputy-api-wrapper models). No real Deputy account or data was used.
const companies = [{ Id: 1, CompanyName: "Harbour St", Active: true }, { Id: 2, CompanyName: "Airport", Active: true }];
const emp = (Id, FirstName, LastName, extra = {}) => ({ Id, FirstName, LastName, DisplayName: `${FirstName} ${LastName}`, Active: true, Company: 1, TerminationDate: null, ...extra });
const ag = (Id, EmployeeId, BaseRate, extra = {}) => ({ Id, EmployeeId, Active: true, BaseRate, PayPoint: 1, StartDate: "2025-01-01T00:00:00+11:00", EndDate: null, SalaryPayRule: 0, Contract: 3, ...extra });
const wp = (Id, EmployeeId, Company, Agreement1, SortOrder = 0) => ({ Id, EmployeeId, Company, Agreement1, Agreement2: 0, Agreement3: 0, SortOrder });
const asOf = "2026-11-16";

test("one location: names, base rates, valid staff lines", () => {
  const r = importDeputyStaff([[emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng")], [ag(100, 10, 24.5), ag(101, 11, 22)], [companies[0]]], { asOf });
  assert.equal(r.rows, 2);
  assert.match(r.staffText, /^Ana Silva, 24\.5, 40, 0, any$/m);
  assert.match(r.staffText, /^Ben Ng, 22, 40, 0, any$/m);
  assert.doesNotMatch(r.staffText, /sites:/);
  const p = parseStaff(r.staffText);
  assert.deepEqual(p.errors, []);
  assert.equal(p.staff.length, 2);
});

test("two locations: sites in sort order and a wage at the second location from its workplace agreement", () => {
  const r = importDeputyStaff([
    [emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng", { Company: 2 })],
    [ag(100, 10, 24), ag(102, 10, 27.25, { PayPoint: 2 }), ag(101, 11, 22, { PayPoint: 2 })],
    [wp(1, 10, 1, 100, 0), wp(2, 10, 2, 102, 1), wp(3, 11, 2, 101, 0)],
    companies,
  ], { asOf });
  assert.match(r.staffText, /^Ana Silva, 24, 40, 0, any, sites: Harbour St \| Airport, wage at Airport: 27\.25$/m);
  assert.match(r.staffText, /^Ben Ng, 22, 40, 0, any, sites: Airport$/m);
  const p = parseStaff(r.staffText);
  assert.deepEqual(p.errors, []);
  const ana = p.staff.find((x) => x.name === "Ana Silva");
  assert.ok(ana.siteWages, "the wage-at cell parses into a per-site wage");
  assert.equal(r.counts.multiSite, 1);
  assert.equal(r.counts.ownRates, 1);
});

test("--location plans one site at each person's rate there, by name or id", () => {
  const inputs = [[emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng")], [ag(100, 10, 24), ag(102, 10, 27.25, { PayPoint: 2 }), ag(101, 11, 22)], [wp(2, 10, 2, 102, 1)], companies];
  for (const location of ["airport", "2"]) {
    const r = importDeputyStaff(inputs, { asOf, location });
    assert.equal(r.rows, 1, location);
    assert.equal(r.staffText.split("\n")[1], "Ana Silva, 27.25, 40, 0, any");
  }
  assert.match(importDeputyStaff(inputs, { asOf, location: "Mall" }).notes[0], /No location "Mall".*Harbour St, Airport/);
});

test("agreements in force on the planning date: ended, future and inactive ones are not used", () => {
  const rows = [emp(10, "Ana", "Silva")];
  const ags = [
    ag(100, 10, 20, { EndDate: "2026-06-30T00:00:00+10:00" }),
    ag(101, 10, 23, { StartDate: "2026-07-01T00:00:00+10:00" }),
    ag(102, 10, 25, { StartDate: "2027-01-01T00:00:00+11:00" }),
    ag(103, 10, 99, { Active: false }),
  ];
  const now = importDeputyStaff([rows, ags], { asOf });
  assert.match(now.staffText, /^Ana Silva, 23,/m);
  assert.equal(now.counts.laterAgreements, 1);
  assert.match(now.notes.join(" "), /1 agreement starting after 2026-11-16 not applied/);
  const later = importDeputyStaff([rows, ags], { asOf: "2027-01-05" });
  assert.match(later.staffText, /^Ana Silva, 25,/m);
});

test("inactive and terminated people are left out; salaried and agreement-less people are flagged at 0", () => {
  const r = importDeputyStaff([
    [emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng", { Active: false }), emp(12, "Cy", "Ito", { TerminationDate: "2026-10-01T00:00:00+10:00" }), emp(13, "Dee", "Fox"), emp(14, "Eli", "Roy")],
    [ag(100, 10, 24), ag(103, 13, 0, { SalaryPayRule: 7 })],
  ], { asOf });
  assert.equal(r.rows, 3);
  assert.doesNotMatch(r.staffText, /Ben Ng|Cy Ito/);
  assert.match(r.staffText, /^Dee Fox, 0,/m);
  assert.match(r.staffText, /^Eli Roy, 0,/m);
  const n = r.notes.join(" ");
  assert.match(n, /1 inactive employee left out/);
  assert.match(n, /1 employee terminated before 2026-11-16 left out/);
  assert.match(n, /1 salaried person/);
  assert.match(n, /1 of 3 have no agreement/);
});

test("names: OtherName as the first name, cell separators stripped, a repeated name kept apart, repeats across files counted once", () => {
  const a = emp(10, "Robert", "Lee", { DisplayName: "", OtherName: "Bob" });
  const r = importDeputyStaff([[a, emp(11, "Kim", "Park, Jr"), emp(12, "Kim", "Park, Jr")], [a], [ag(100, 10, 21), ag(100, 10, 21)]], { asOf });
  assert.equal(r.rows, 3);
  assert.match(r.staffText, /^Bob Lee, 21,/m);
  assert.match(r.staffText, /^Kim Park Jr, 0,/m);
  assert.match(r.staffText, /^Kim Park Jr 12, 0,/m);
  assert.match(r.skipped.join(" "), /second person with this name/);
  assert.deepEqual(parseStaff(r.staffText).errors, []);
});

test("JSON text, NDJSON from --save, an error answer and unrelated JSON", () => {
  const nd = [JSON.stringify([emp(10, "Ana", "Silva")]), JSON.stringify([ag(100, 10, 24)]), JSON.stringify(companies)].join("\n");
  assert.equal(importDeputyStaff(nd, { asOf }).rows, 1);
  assert.match(importDeputyStaff('{"error":{"code":401,"message":"Invalid token"}}').notes[0], /error: Invalid token/);
  assert.match(importDeputyStaff([[ag(100, 10, 24)]]).notes[0], /add the response of POST \/api\/v1\/resource\/Employee\/QUERY/);
  assert.match(importDeputyStaff('{"object":"users","data":[]}').notes[0], /No Deputy employees/);
  assert.match(importDeputyStaff([], { asOf: "11/16/2026" }).notes[0], /not a date/);
});

test("staff JSON is told apart from Deputy rosters and from 7shifts users", () => {
  const staff = JSON.stringify([emp(10, "Ana", "Silva")]);
  const agr = JSON.stringify([ag(100, 10, 24)]);
  assert.ok(looksLikeDeputyStaff(staff));
  assert.ok(looksLikeDeputyStaff(agr));
  assert.ok(!looksLikeDeputyStaff('{"object":"users","data":[{"id":1,"first_name":"A","last_name":"B"}]}'));
  assert.ok(!looksLikeDeputyStaff('[{"Id":1,"StartTime":1514759400,"EndTime":1514766600,"Employee":10}]'));
  assert.ok(!looksLikeDeputy(staff), "a staff file is not read as rosters");
});

test("fetchDeputyStaff: four paged QUERY calls to the install, OAuth header, never anywhere else", async () => {
  const calls = [];
  const data = { Employee: [emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng"), emp(12, "Cy", "Ito")], EmployeeAgreement: [ag(100, 10, 24)], EmployeeWorkplace: [], Company: companies };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const res = /resource\/(\w+)\/QUERY/.exec(url)[1];
    const b = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => data[res].slice(b.start, b.start + b.max) };
  };
  const got = await fetchDeputyStaff({ token: "t0k", install: "https://yourco.au.deputy.com/", fetchImpl, pageSize: 2 });
  assert.ok(calls.every((c) => c.url.startsWith("https://yourco.au.deputy.com/api/v1/resource/")));
  assert.ok(calls.every((c) => c.init.method === "POST" && c.init.headers.Authorization === "OAuth t0k"));
  assert.deepEqual(calls.map((c) => /resource\/(\w+)/.exec(c.url)[1]), ["Employee", "Employee", "EmployeeAgreement", "EmployeeWorkplace", "Company", "Company"]);
  assert.deepEqual(calls[0].body.search, { s1: { field: "Active", type: "eq", data: true } });
  assert.equal(calls[1].body.start, 2);
  assert.equal(importDeputyStaff(got.responses, { asOf }).rows, 3);
  await assert.rejects(fetchDeputyStaff({ token: "", install: "a.na.deputy.com", fetchImpl }), /DEPUTY_TOKEN/);
  await assert.rejects(fetchDeputyStaff({ token: "x", install: "evil.example.com", fetchImpl }), /DEPUTY_INSTALL/);
  const denied = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(fetchDeputyStaff({ token: "x", install: "a.na.deputy.com", fetchImpl: denied }), /403.*cannot read/);
});

// Time off (2026-11-19). Rows in the shape of Deputy's documented EmployeeAvailability sample response ("Setting an
// Employees Unavailability", developer.deputy.com) and its Leave fields. Invented values; no real account was used.
// Sydney in November is UTC+11.
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);
const un = (Id, Employee, startIso, endIso, extra = {}) => ({ Id, Employee, Type: 0, MaxDateRecurringGenerated: null, StartTime: unix(startIso), EndTime: unix(endIso), Date: startIso.slice(0, 10) + "T00:00:00+11:00", Comment: "", Schedule: 0, Creator: 1, StartTimeLocalized: startIso, EndTimeLocalized: endIso, ...extra });
const lv = (Id, Employee, DateStart, DateEnd, Status = 1, extra = {}) => ({ Id, Employee, EmployeeHistory: 1, Company: 1, LeaveRule: 2, DateStart, DateEnd, Days: 1, Status, ApprovalComment: "", Comment: "", ...extra });
const week = "2026-11-16";

test("unavailability blocks become dated off: cells for the week, split at midnight, and apply in parseStaff", () => {
  const r = importDeputyStaff([
    [emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng")],
    [ag(100, 10, 24), ag(101, 11, 22)],
    [
      un(1, 10, "2026-11-18T09:00:00+11:00", "2026-11-18T13:30:00+11:00"),          // Wed morning lecture
      un(2, 10, "2026-11-20T00:00:00+11:00", "2026-11-21T00:00:00+11:00"),          // all of Friday (documented sample shape)
      un(3, 11, "2026-11-21T22:00:00+11:00", "2026-11-22T06:00:00+11:00", { Type: 1, Schedule: 7 }), // Sat night into Sun
      un(4, 11, "2026-11-25T09:00:00+11:00", "2026-11-25T17:00:00+11:00"),          // next week: not written
    ],
    [companies[0]],
  ], { asOf, week });
  assert.match(r.staffText, /^Ana Silva, 24, 40, 0, any, off: 2026-11-18 9-13:30; 2026-11-20$/m);
  assert.match(r.staffText, /^Ben Ng, 22, 40, 0, any, off: 2026-11-21 22-24; 2026-11-22 0-6$/m);
  assert.equal(r.counts.offPeople, 2);
  assert.match(r.notes.join(" "), /3 unavailability blocks \(1 from a recurring pattern\) and 0 approved leave requests written as 4 dated off: entries for 2 people/);
  const p = parseStaff(r.staffText, { weekStart: week });
  assert.deepEqual(p.errors, []);
  const ana = p.staff.find((x) => x.name === "Ana Silva");
  // Wednesday (index 2): free 0-9 and 13:30-24; Friday (index 4): nothing.
  assert.deepEqual(ana.days[2], [[0, 540], [810, 1440]]);
  assert.deepEqual(ana.days[4], []);
  assert.deepEqual(ana.days[0], [[0, 1440]]);
});

test("approved leave is whole days; awaiting, declined and cancelled are not applied; overlapping pieces merge", () => {
  const r = importDeputyStaff([
    [emp(10, "Ana", "Silva"), emp(11, "Ben", "Ng"), emp(12, "Cy", "Ito")],
    [ag(100, 10, 24), ag(101, 11, 22), ag(102, 12, 21)],
    [lv(1, 10, "2026/11/14", "2026/11/17", 1), lv(2, 11, "2026-11-19", "2026-11-19", 0), lv(3, 11, "2026-11-20", "2026-11-20", 2), lv(4, 12, "2026-11-21T00:00:00+11:00", "2026-11-21T00:00:00+11:00", 4, { AllDay: false })],
    [un(1, 10, "2026-11-18T09:00:00+11:00", "2026-11-18T12:00:00+11:00"), un(2, 10, "2026-11-18T11:00:00+11:00", "2026-11-18T15:00:00+11:00")],
  ], { asOf, week });
  assert.match(r.staffText, /^Ana Silva, 24, 40, 0, any, off: 2026-11-16; 2026-11-17; 2026-11-18 9-15$/m);
  assert.match(r.staffText, /^Ben Ng, 22, 40, 0, any$/m);
  assert.match(r.staffText, /^Cy Ito, 21, 40, 0, any, off: 2026-11-21$/m);
  const n = r.notes.join(" ");
  assert.match(n, /1 leave request awaiting approval/);
  assert.match(n, /1 part-day leave request blocked for the whole day/);
  assert.deepEqual(parseStaff(r.staffText, { weekStart: week }).errors, []);
});

test("time off without a week is read but not applied, and a week that is not a Monday is refused", () => {
  const inputs = [[emp(10, "Ana", "Silva")], [ag(100, 10, 24)], [un(1, 10, "2026-11-18T09:00:00+11:00", "2026-11-18T13:00:00+11:00")]];
  const none = importDeputyStaff(inputs, { asOf });
  assert.doesNotMatch(none.staffText, /off:/);
  assert.match(none.notes.join(" "), /1 Deputy unavailability or leave row read but not applied/);
  assert.match(importDeputyStaff(inputs, { week: "2026-11-18" }).notes[0], /not a Monday/);
  // --weeks 2 reaches the second week.
  const two = importDeputyStaff([...inputs, [un(2, 10, "2026-11-27T09:00:00+11:00", "2026-11-27T10:00:00+11:00")]], { asOf, week, weeks: 2 });
  assert.match(two.staffText, /off: 2026-11-18 9-13; 2026-11-27 9-10$/m);
});

test("blocks with only Unix times read at the Date offset, or a named zone, or UTC with a note", () => {
  const bare = (o) => { const x = un(1, 10, "2026-11-18T09:00:00+11:00", "2026-11-18T13:00:00+11:00", o); delete x.StartTimeLocalized; delete x.EndTimeLocalized; return x; };
  const base = [[emp(10, "Ana", "Silva")], [ag(100, 10, 24)]];
  assert.match(importDeputyStaff([...base, [bare()]], { asOf, week }).staffText, /off: 2026-11-18 9-13$/m);
  assert.match(importDeputyStaff([...base, [bare({ Date: null })]], { asOf, week, timeZone: "Australia/Sydney" }).staffText, /off: 2026-11-18 9-13$/m);
  const utc = importDeputyStaff([...base, [bare({ Date: null })]], { asOf, week });
  assert.match(utc.staffText, /off: 2026-11-17 22-24; 2026-11-18 0-2$/m);
  assert.match(utc.notes.join(" "), /read in UTC: pass --tz/);
});

test("unavailability rows are not read as rosters by the roster import", async () => {
  const { importDeputy } = await import("./import-deputy.mjs");
  const r = importDeputy([[un(1, 10, "2026-11-18T09:00:00+11:00", "2026-11-18T13:00:00+11:00")]]);
  assert.equal(r.rows || 0, 0);
});

test("fetch with a week adds the EmployeeAvailability and Leave queries for those days", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => [] }; };
  const got = await fetchDeputyStaff({ token: "t", install: "acme.au.deputy.com", week, fetchImpl });
  assert.equal(got.responses.length, 6);
  const av = calls.find((c) => c.url.endsWith("/resource/EmployeeAvailability/QUERY"));
  assert.ok(av);
  assert.equal(av.body.search.s1.data, unix("2026-11-16T00:00:00Z") - 2 * 86400);
  const leave = calls.find((c) => c.url.endsWith("/resource/Leave/QUERY"));
  assert.deepEqual([leave.body.search.s1.data, leave.body.search.s2.data], [week, "2026-11-22"]);
  const plain = await fetchDeputyStaff({ token: "t", install: "acme.au.deputy.com", fetchImpl });
  assert.equal(plain.responses.length, 4);
});
