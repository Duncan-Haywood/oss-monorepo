// Per-location pay from imports (2026-11-14): staff CSVs (long and wide) and 7shifts users + wages become sites: and
// "wage at <site>:" cells that the builder prices. Invented layouts and values; no real export or account was used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importStaffCsv, siteRateColumn } from "./import-staff.mjs";
import { import7shiftsStaff, fetch7shiftsStaff } from "./import-7shifts.mjs";
import { parseStaff, personSiteRate, siteKey } from "./calc.mjs";

const rateAt = (staffText, name, site) => {
  const p = parseStaff(staffText);
  assert.deepEqual(p.errors, []);
  const s = p.staff.find((x) => x.name === name);
  return personSiteRate(s, siteKey(site), null);
};

test("wide rate columns are told apart from kinds of pay", () => {
  for (const [h, want] of [["Wage at Airport", "Airport"], ["Rate @ Main St.", "Main St."], ["Pay rate - Harbour", "Harbour"], ["Rate (Airport)", "Airport"], ["Airport rate", "Airport"], ["Downtown hourly rate", "Downtown"]]) assert.equal(siteRateColumn(h), want, h);
  for (const h of ["Overtime rate", "Base rate", "Hourly rate", "Rate", "Sunday rate", "Pay", "Max hours", "Double time rate", "Commission rate"]) assert.equal(siteRateColumn(h), null, h);
});

test("long CSV: one row per person per location becomes sites and wage-at cells", () => {
  const r = importStaffCsv("Employee,Location,Hourly Rate,Position\nAna,Main,18,Server\nAna,Airport,21.5,Server\nAna,Harbour,18,Bar\nBen,Main,17,Cook\nCy,Airport,20,Cook\nCy,Airport,20,Cook");
  assert.equal(r.rows, 3);
  assert.match(r.staffText, /^Ana, 18, 40, 0, any, role: Server\/Bar, sites: Main \| Airport \| Harbour, wage at Airport: 21.5$/m);
  assert.match(r.staffText, /^Ben, 17, 40, 0, any, role: Cook, sites: Main$/m);
  assert.deepEqual(r.skipped, ["Row 7 (Cy): listed twice"]);
  assert.equal(rateAt(r.staffText, "Ana", "Airport"), 21.5);
  assert.equal(rateAt(r.staffText, "Ana", "Main"), 18);
  const p = parseStaff(r.staffText).staff.find((x) => x.name === "Ana");
  assert.deepEqual(p.sites, ["main", "airport", "harbour"]);
});

test("long CSV: the own wage is the most common rate, ties to the lowest; site names with punctuation still match", () => {
  const r = importStaffCsv("Name,Store,Rate\nDi,Main & 5th,20\nDi,Airport,22\nDi,Mall,20\nEd,North,16\nEd,South,17");
  assert.match(r.staffText, /^Di, 20, .*sites: Main 5th \| Airport \| Mall, wage at Airport: 22$/m);
  assert.match(r.staffText, /^Ed, 16, .*wage at South: 17$/m);
  // A shift written "site: Main & 5th" meets the cleaned name.
  assert.equal(siteKey("Main & 5th"), siteKey("Main 5th"));
});

test("wide CSV: absolute and relative rates, blanks and equal rates write no cell, bad cells are reported", () => {
  const r = importStaffCsv("Name,Hourly Rate,Wage at Airport,Downtown rate,Overtime rate\nAna,18,21.30,,27\nBen,17,+2,17,25.5\nCy,16,abc,16,24");
  assert.match(r.staffText, /^Ana, 18, 40, 0, any, wage at Airport: 21.3$/m);
  assert.match(r.staffText, /^Ben, 17, 40, 0, any, wage at Airport: \+2$/m);
  assert.match(r.staffText, /^Cy, 16, 40, 0, any$/m);
  assert.deepEqual(r.unknown, ["overtime rate"]);
  assert.match(r.skipped.join(" "), /"abc" under "Airport"/);
  assert.equal(rateAt(r.staffText, "Ben", "Airport"), 19);
});

test("files with no location or rate columns import exactly as before", () => {
  const r = importStaffCsv("First Name,Last Name,Position,Hourly Rate,Status\nAna,Lopez,Server|Bar,$18.50,Active\nCy,Roe,Cook,15,Active\nCy,Roe,Cook,15,Active");
  assert.equal(r.staffText, "name, wage, max hours, min hours, availability\nAna Lopez, 18.5, 40, 0, any, role: Server/Bar\nCy Roe, 15, 40, 0, any, role: Cook");
  assert.deepEqual(r.skipped, ["Row 4 (Cy Roe): listed twice"]);
});

// A 7shifts company in the shape of the 2023-05-01 API definition.
const company = () => [
  { object: "users", data: [
    { id: 1, first_name: "Ana", last_name: "Lopez", active: true, type: "employee", hourly_wage: 1800, wage_type: "hourly", max_weekly_hours: "32" },
    { id: 2, first_name: "Benjamin", preferred_first_name: "Ben", last_name: "Ng", active: true, type: "employee", hourly_wage: 1700, wage_type: "hourly", max_weekly_hours: "" },
    { id: 3, first_name: "Old", last_name: "Hand", active: false, type: "employee", hourly_wage: 1600 },
    { id: 4, first_name: "Mo", last_name: "Boss", active: true, type: "manager", appear_as_employee: false, hourly_wage: 0 },
    { id: 5, first_name: "Sal", last_name: "Aried", active: true, type: "employee", hourly_wage: 0, wage_type: "weekly_salary" },
  ], meta: { cursor: { next: null } } },
  { object: "roles", data: [{ id: 10, location_id: 100, name: "Server" }, { id: 11, location_id: 200, name: "Server" }, { id: 12, location_id: 200, name: "Bar" }, { id: 13, location_id: 100, name: "Cook" }] },
  { object: "locations", data: [{ id: 100, name: "Main", timezone: "America/Los_Angeles" }, { id: 200, name: "Airport", timezone: "America/Los_Angeles" }] },
  { object: "assignments", user_id: 1, data: { locations: [{ id: 100, name: "Main" }, { id: 200, name: "Airport" }], roles: [{ id: 10, location_id: 100, name: "Server" }, { id: 11, location_id: 200, name: "Server" }, { id: 12, location_id: 200, name: "Bar" }] } },
  { object: "user_wages", user_id: 1, data: { current_wages: [
    { id: 1, role_id: null, wage_type: "hourly", wage_cents: 1800, effective_date: "2026-01-01" },
    { id: 2, role_id: 10, wage_type: "hourly", wage_cents: 1800, effective_date: "2026-01-01" },
    { id: 3, role_id: 11, wage_type: "hourly", wage_cents: 2150, effective_date: "2026-01-01" },
    { id: 4, role_id: 12, wage_type: "hourly", wage_cents: 2250, effective_date: "2026-01-01" },
  ], upcoming_wages: [{ id: 5, role_id: 11, wage_type: "hourly", wage_cents: 2300, effective_date: "2026-12-01" }] } },
  { object: "assignments", user_id: 2, data: { locations: [{ id: 100, name: "Main" }], roles: [{ id: 13, location_id: 100, name: "Cook" }] } },
  { object: "user_wages", user_id: 2, data: { current_wages: [{ id: 6, role_id: 13, wage_type: "hourly", wage_cents: 1700, effective_date: "2025-06-01" }], upcoming_wages: [] } },
  { object: "assignments", user_id: 5, data: { locations: [{ id: 100, name: "Main" }], roles: [{ id: 13, location_id: 100, name: "Cook" }] } },
  { object: "user_wages", user_id: 5, data: { current_wages: [{ id: 7, role_id: null, wage_type: "weekly_salary", wage_cents: 90000, effective_date: "2025-06-01" }], upcoming_wages: [] } },
];

test("7shifts: users, assignments and wages become roles, sites and wage-at cells", () => {
  const r = import7shiftsStaff(company().map((x) => JSON.stringify(x)));
  assert.equal(r.rows, 3);
  const lines = r.staffText.split("\n");
  assert.equal(lines[1], "Ana Lopez, 18, 32, 0, any, role: Server/Bar, sites: Main | Airport, wage at Airport: 22.5");
  assert.equal(lines[2], "Ben Ng, 17, 40, 0, any, role: Cook, sites: Main");
  assert.equal(lines[3], "Sal Aried, 0, 40, 0, any, role: Cook, sites: Main");
  const n = r.notes.join(" ");
  assert.match(n, /1 deactivated user left out/);
  assert.match(n, /1 manager not set to appear/);
  assert.match(n, /1 person-location with roles at different rates: the highest/);
  assert.match(n, /1 salaried person/);
  assert.equal(rateAt(r.staffText, "Ana Lopez", "Airport"), 22.5);
});

test("7shifts: --wages-as-of applies upcoming wages; --location plans one site at its rates", () => {
  const later = import7shiftsStaff(company(), { asOf: "2026-12-07" });
  assert.match(later.staffText, /^Ana Lopez, 18, 32, 0, any, role: Server\/Bar, sites: Main \| Airport, wage at Airport: 23$/m);
  assert.match(later.notes.join(" "), /1 upcoming wage already in force/);
  const air = import7shiftsStaff(company(), { location: "Airport" });
  assert.equal(air.staffText, "name, wage, max hours, min hours, availability\nAna Lopez, 22.5, 32, 0, any, role: Server/Bar");
  assert.match(import7shiftsStaff(company(), { location: "Moon" }).notes[0], /No location "Moon"/);
});

test("7shifts: untagged per-user responses and missing users are reported", () => {
  const c = company();
  delete c[3].user_id;
  const r = import7shiftsStaff(c);
  assert.match(r.notes.join(" "), /1 saved assignments or wages response\(s\) carry no user_id/);
  assert.match(import7shiftsStaff([c[1]]).notes[0], /No 7shifts users found/);
});

test("7shifts: the fetch pages users, then asks each user's assignments and wages and tags them", async () => {
  const c = company();
  const asked = [];
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer t0k");
    const u = new URL(url);
    asked.push(u.pathname + (u.searchParams.get("status") ? "?status=" + u.searchParams.get("status") : ""));
    const m = /users\/(\d+)\/(assignments|wages)$/.exec(u.pathname);
    let body;
    if (m) { const k = m[2] === "wages" ? "user_wages" : "assignments"; const x = c.find((y) => y.object === k && String(y.user_id) === m[1]); body = x ? { object: k, data: x.data } : { object: k, data: k === "assignments" ? { locations: [] } : { current_wages: [], upcoming_wages: [] } }; }
    else if (u.pathname.endsWith("/users")) body = { ...c[0], data: c[0].data.filter((x) => x.active) };
    else if (u.pathname.endsWith("/roles")) body = c[1];
    else body = c[2];
    return { ok: true, status: 200, json: async () => body };
  };
  const got = await fetch7shiftsStaff({ token: "t0k", companyId: 7, fetchImpl });
  assert.equal(asked[0], "/v2/company/7/users?status=active");
  assert.ok(asked.includes("/v2/company/7/users/1/wages"));
  assert.ok(got.responses.filter((x) => x.user_id != null).length === 8);
  const r = import7shiftsStaff(got.responses);
  assert.match(r.staffText, /wage at Airport: 22.5/);
  await assert.rejects(fetch7shiftsStaff({ token: "", fetchImpl }), /SEVENSHIFTS_ACCESS_TOKEN/);
});

test("CLI: --import-7shifts-staff and --import-staff write cells the build prices", () => {
  const dir = mkdtempSync(join(tmpdir(), "srb-"));
  const f = join(dir, "team.jsonl");
  writeFileSync(f, company().map((x) => JSON.stringify(x)).join("\n"));
  const out = execFileSync(process.execPath, ["cli.mjs", "--import-7shifts-staff", f], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Ana Lopez, 18, 32, 0, any, role: Server\/Bar, sites: Main \| Airport, wage at Airport: 22.5/);
  const staff = join(dir, "staff.txt"), shifts = join(dir, "shifts.txt");
  writeFileSync(staff, out);
  writeFileSync(shifts, "Mon,9,17,1,Server,site: Airport\nTue,9,17,1,Cook,site: Main\n");
  const built = execFileSync(process.execPath, ["cli.mjs", staff, shifts, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const j = JSON.parse(built);
  const air = j.assignments.find((a) => a.site === "Airport");
  assert.equal(air.person, "Ana Lopez");
  // Tuesday's Main cook shift goes to the salaried cook at wage 0 (the note says so), so payroll is Ana's Airport day.
  assert.equal(j.assignments.find((a) => a.site === "Main").person, "Sal Aried");
  assert.equal(j.payroll, 8 * 22.5);
  assert.equal(j.siteWage.extra, 8 * (22.5 - 18));
  const csv = join(dir, "long.csv");
  writeFileSync(csv, "Employee,Location,Hourly Rate\nAna,Main,18\nAna,Airport,21.5\n");
  assert.match(execFileSync(process.execPath, ["cli.mjs", "--import-staff", csv], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /Ana, 18, 40, 0, any, sites: Main \| Airport, wage at Airport: 21.5/);
});
