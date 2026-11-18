import { test } from "node:test";
import assert from "node:assert/strict";
import { importDeputy, fetchDeputy, within, looksLikeDeputy, deputyBase } from "./import-deputy.mjs";
import { looksLikeWhenIWork } from "./import-wheniwork.mjs";
import { looksLikeSquare } from "./import-square.mjs";
import { parseShifts } from "./calc.mjs";

// Rows in the shape of Deputy's resource API as two open-source clients show it (communityds/deputy-api-wrapper's mock
// responses and schema, google/deputy-api-python-client's test fixtures; eval/deputy-api-format-2026-11-17.md).
// Invented values; no Deputy account or real response was used.
const unit = (Id, name, Company, CompanyName) => ({ Id, Creator: 1, Company, ParentOperationalUnit: 0, OperationalUnitName: name, Active: true, CompanyName });
const areas = [unit(983, "Floor", 1, "Main St"), unit(984, "Kitchen", 1, "Main St"), unit(523, "Floor", 2, "Harbour")];
// Mon 2 Nov 2026 in Chicago is -06:00.
const iso = (h, m = "00", d = "02") => `2026-11-${d}T${h}:${m}:00-06:00`;
const unixAt = (s) => Date.parse(s) / 1000;
const ro = (Id, start, end, extra = {}) => ({ Id, Date: "2026-11-02T00:00:00-06:00", StartTime: unixAt(start), EndTime: unixAt(end), Mealbreak: "2026-11-02T00:30:00-06:00", Slots: [], TotalTime: 0, Cost: 0, OperationalUnit: 983, Employee: 10 + Id, Comment: "", Published: true, Open: false, StartTimeLocalized: start, EndTimeLocalized: end, ...extra });

test("localized times are the wall clock; areas are roles and their company is the location", () => {
  const r = importDeputy([[ro(1, iso("07"), iso("15")), ro(2, iso("07"), iso("15")), ro(3, iso("15"), iso("23"), { OperationalUnit: 984 })], areas]);
  assert.equal(r.rows, 3);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , floor/);
  assert.match(r.shiftsText, /Mon, 15:00, 23:00, 1, , kitchen/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  assert.match(r.notes[0], /Read 3 Deputy rosters/);
});

test("the wrapper's own mock roster (Adelaide, +10:30) reads as 9:00 to 11:00 on Monday 1 Jan 2018", () => {
  // communityds/deputy-api-wrapper tests/Adapter/MockClient.php, ROSTER_NEW (MIT), fields as written there.
  const mock = { Id: 92831, Date: "2018-01-01T00:00:00+10:30", StartTime: 1514759400, EndTime: 1514766600, Mealbreak: "2018-01-01T00:30:00+10:30", Slots: [], TotalTime: 0.0, Cost: 0, OperationalUnit: 983, Employee: 1, Comment: "", Warning: "", WarningOverrideComment: "", Published: true, MatchedByTimesheet: 0, Open: false, ConfirmStatus: 0, StartTimeLocalized: "2018-01-01T09:00:00+10:30", EndTimeLocalized: "2018-01-01T11:00:00+10:30", ExternalId: null };
  const r = importDeputy([[mock], [unit(983, "First Unit", 1, "First Company")]]);
  assert.match(r.shiftsText, /Mon, 9:00, 11:00, 1, , first unit/);
  // The Unix times agree with the localized ones: 1514759400 is 2017-12-31T22:30Z, 09:00 at +10:30.
  const { StartTimeLocalized, EndTimeLocalized, ...unixOnly } = mock;
  const u = importDeputy([[unixOnly]]);
  assert.match(u.shiftsText, /Mon, 9:00, 11:00, 1/);
  assert.match(u.notes.join(" "), /offset of its Date/);
});

test("only Unix times: --tz reads them in the zone, otherwise UTC with a note", () => {
  const bare = { Id: 1, StartTime: unixAt(iso("07")), EndTime: unixAt(iso("15")), OperationalUnit: 983, Employee: 5, Published: true };
  const z = importDeputy([[bare], areas], { timeZone: "America/Chicago" });
  assert.match(z.shiftsText, /Mon, 7:00, 15:00, 1, , floor/);
  const utc = importDeputy([[bare], areas]);
  assert.match(utc.shiftsText, /Mon, 13:00, 21:00/);
  assert.match(utc.notes.join(" "), /read in UTC: give the site's time zone/);
  assert.match(importDeputy([[bare]], { timeZone: "Mars/Olympus" }).notes[0], /not a time zone name/);
});

test("open shifts count as needed; drafts are read or left out", () => {
  const list = [ro(1, iso("07"), iso("15"), { Employee: 0, Open: true }), ro(2, iso("07"), iso("15"), { Published: false }), ro(3, iso("07"), iso("15"))];
  const r = importDeputy([list, areas]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 3, , floor/);
  assert.match(r.notes.join(" "), /1 open shift with nobody on it/);
  assert.match(r.notes.join(" "), /1 unpublished roster read as planned/);
  const d = importDeputy([list, areas], { drafts: false });
  assert.match(d.shiftsText, /Mon, 7:00, 15:00, 2, , floor/);
});

test("two locations: listed, and one picked by name or company id", () => {
  const list = [ro(1, iso("07"), iso("15")), ro(2, iso("07"), iso("15"), { OperationalUnit: 523 }), ro(3, iso("09"), iso("17"), { OperationalUnit: 523 })];
  const all = importDeputy([list, areas]);
  assert.deepEqual(all.locations.map((l) => l.name ?? l).sort(), ["Harbour", "Main St"]);
  const h = importDeputy([list, areas], { location: "harbour" });
  assert.equal(h.rows, 2);
  const byId = importDeputy([list, areas], { location: 2 });
  assert.equal(byId.rows, 2);
});

test("joined OperationalUnitObject gives names without the areas response; bare ids are flagged", () => {
  const r = importDeputy([[ro(1, iso("07"), iso("15"), { OperationalUnit: 7, OperationalUnitObject: { Id: 7, OperationalUnitName: "Bar", Company: 3, CompanyName: "Dockside" } })]]);
  assert.match(r.shiftsText, /, bar/);
  const n = importDeputy([[ro(1, iso("07"), iso("15"), { OperationalUnit: 7 })]]);
  assert.match(n.shiftsText, /area 7/);
  assert.match(n.notes.join(" "), /Areas are shown as numbers/);
});

test("overnight shift, damaged rows, repeats across files and an error answer", () => {
  const night = ro(1, iso("22"), iso("06", "00", "03"));
  const bad = ro(2, iso("15"), iso("07"));
  const r = importDeputy([JSON.stringify([night, bad]), JSON.stringify([night]), areas]);
  assert.equal(r.rows, 1);
  assert.match(r.shiftsText, /Mon, 22:00, 6:00, 1/);
  assert.match(r.skipped.join(" "), /Roster 2: ends at or before its start/);
  assert.match(r.notes[0], /1 repeated across files counted once/);
  assert.match(importDeputy([{ error: { code: 401, message: "Invalid token" } }]).notes[0], /Deputy answered with an error: Invalid token/);
  assert.match(importDeputy([areas]).notes[0], /No Deputy rosters found/);
});

test("the page tells Deputy JSON apart from Square's and When I Work's", () => {
  const t = JSON.stringify([ro(1, iso("07"), iso("15"))]);
  assert.equal(looksLikeDeputy(t), true);
  assert.equal(looksLikeSquare(t), false);
  assert.equal(looksLikeWhenIWork(t), false);
  assert.equal(looksLikeDeputy(JSON.stringify({ shifts: [{ start_time: "Mon, 02 Nov 2026 07:00:00 -0600" }] })), false);
});

test("install address: only a deputy.com host gets the token", () => {
  assert.equal(deputyBase("yourco.na.deputy.com"), "https://yourco.na.deputy.com/api/v1/");
  assert.equal(deputyBase("https://YourCo.au.deputy.com/api/v1/"), "https://yourco.au.deputy.com/api/v1/");
  assert.equal(deputyBase("evil.example.com"), null);
  assert.equal(deputyBase("deputy.com.evil.example"), null);
});

test("fetch: OAuth header, QUERY bodies, paging by start, then within() keeps the wall-clock range", async () => {
  const calls = [];
  const rows = Array.from({ length: 5 }, (_, i) => ro(i + 1, iso("07"), iso("15")));
  rows.push(ro(9, iso("07", "00", "10"), iso("15", "00", "10")));
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, method: init.method, body });
    const res = url.includes("/Roster/") ? rows.slice(body.start, body.start + body.max) : url.includes("/OperationalUnit/") ? areas : [{ Id: 1, CompanyName: "Main St" }];
    return { ok: true, status: 200, json: async () => res };
  };
  const got = await fetchDeputy({ token: "t0k", install: "yourco.na.deputy.com", from: "2026-11-02", to: "2026-11-08", fetchImpl, pageSize: 2 });
  const roster = calls.filter((c) => c.url.endsWith("/api/v1/resource/Roster/QUERY"));
  assert.deepEqual(roster.map((c) => c.body.start), [0, 2, 4, 6]);
  assert.ok(calls.every((c) => c.auth === "OAuth t0k" && c.method === "POST" && c.url.startsWith("https://yourco.na.deputy.com/api/v1/")));
  assert.equal(roster[0].body.search.s1.field, "StartTime");
  assert.deepEqual(roster[0].body.join, ["OperationalUnitObject"]);
  const r = importDeputy(within(got.responses, got.from, got.to));
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 5, , floor/);
  assert.doesNotMatch(r.shiftsText, /Tue/);
  await assert.rejects(fetchDeputy({ token: "", install: "a.na.deputy.com", from: "2026-11-02", to: "2026-11-08", fetchImpl }), /DEPUTY_TOKEN/);
  await assert.rejects(fetchDeputy({ token: "x", install: "a.example.com", from: "2026-11-02", to: "2026-11-08", fetchImpl }), /DEPUTY_INSTALL/);
  const denied = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(fetchDeputy({ token: "x", install: "a.na.deputy.com", from: "2026-11-02", to: "2026-11-08", fetchImpl: denied }), /401.*check the token/);
});
