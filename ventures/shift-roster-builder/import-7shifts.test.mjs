import { test } from "node:test";
import assert from "node:assert/strict";
import { import7shifts, fetch7shifts, within } from "./import-7shifts.mjs";
import { parseShifts } from "./calc.mjs";

// Invented rows in the shape of 7shifts' API (v2, 2023-05-01 definition): UTC ISO times, ids for role and location,
// the open/close/draft/deleted flags. No real 7shifts account or data was used.
const loc = { id: 11, name: "Queen St", timezone: "America/Toronto", sat_hours_close: "23:00:00", fri_hours_close: "22:00:00" };
const roles = { object: "roles", data: [{ id: 5, name: "Server", location_id: 11, num_stations: 0 }, { id: 6, name: "Cook", location_id: 11, num_stations: 0 }] };
const locations = { object: "locations", data: [loc] };
// Mon 2026-11-02: Toronto is UTC-5 (EST since 1 Nov), so 12:00Z is 7:00 local.
const sh = (id, start, end, extra = {}) => ({ id, user_id: 100 + id, start, end, location_id: 11, role_id: 5, close: false, open: false, draft: false, deleted: false, publish_status: "published", attendance_status: "none", ...extra });
const shifts = (...data) => ({ object: "shifts", data, meta: { cursor: { next: null } } });

test("UTC times become the location's wall clock; role names from the roles response", () => {
  const r = import7shifts([shifts(sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"), sh(2, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"), sh(3, "2026-11-02T20:00:00Z", "2026-11-03T04:00:00Z", { role_id: 6 })), roles, locations]);
  assert.equal(r.rows, 3);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , server/);
  assert.match(r.shiftsText, /Mon, 15:00, 23:00, 1, , cook/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  assert.doesNotMatch(r.notes.join(" "), /UTC/);
});

test("summer time moves the UTC hour, not the wall clock", () => {
  // 2026-07-06 is a Monday in EDT (UTC-4): 11:00Z is 7:00 local, the same shift as 12:00Z in November.
  const r = import7shifts([shifts(sh(1, "2026-07-06T11:00:00Z", "2026-07-06T19:00:00Z"), sh(2, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z")), roles, locations]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , server/);
  assert.equal(r.shifts, 1);
});

test("an overnight shift keeps its start day; a shift late in UTC lands on the local day", () => {
  // Sat 2026-11-07 22:00 Toronto = Sun 03:00Z; ends Sun 02:00 local.
  const r = import7shifts([shifts(sh(1, "2026-11-08T03:00:00Z", "2026-11-08T07:00:00Z")), roles, locations]);
  assert.match(r.shiftsText, /Sat, 22:00, 2:00, 1/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
});

test("open shifts count as needed; deleted shifts do not; drafts on request", () => {
  const data = [
    sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"),
    sh(2, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z", { open: true, user_id: null }),
    sh(3, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z", { deleted: true }),
    sh(4, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z", { publish_status: "published_deleted" }),
    sh(5, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z", { draft: true, publish_status: "draft" }),
  ];
  const r = import7shifts([shifts(...data), roles, locations]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 3, , server/);
  assert.equal(r.counts.open, 1);
  assert.equal(r.counts.deleted, 2);
  assert.match(r.notes.join(" "), /1 open shift .* counted as needed/);
  assert.match(r.notes.join(" "), /1 unpublished draft shift read/);
  const p = import7shifts([shifts(...data), roles, locations], { drafts: false });
  assert.match(p.shiftsText, /Mon, 7:00, 15:00, 2, , server/);
});

test("'until close' ends at the location's closing time for that weekday", () => {
  // Sat 2026-11-07 17:00 local = 22:00Z; end in the row is a placeholder.
  const r = import7shifts([shifts(sh(1, "2026-11-07T22:00:00Z", "2026-11-07T23:00:00Z", { close: true })), roles, locations]);
  assert.match(r.shiftsText, /Sat, 17:00, 23:00, 1/);
  const n = import7shifts([shifts(sh(1, "2026-11-07T22:00:00Z", "2026-11-07T23:00:00Z", { close: true })), roles]);
  assert.match(n.notes.join(" "), /use the shift's own end time/);
});

test("without a time zone the times are UTC and the note says so; --tz fixes it", () => {
  const one = shifts(sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"));
  const r = import7shifts([one, roles]);
  assert.match(r.shiftsText, /Mon, 12:00, 20:00/);
  assert.match(r.notes.join(" "), /read in UTC/);
  const t = import7shifts([one, roles], { timeZone: "America/Toronto" });
  assert.match(t.shiftsText, /Mon, 7:00, 15:00/);
  assert.match(import7shifts([one], { timeZone: "Mars/Base" }).notes[0], /not a time zone/);
  assert.doesNotMatch(r.notes.join(" "), /Roles are shown as numbers/);
  const bare = import7shifts([one]);
  assert.match(bare.shiftsText, /role 5/);
  assert.match(bare.notes.join(" "), /Roles are shown as numbers/);
});

test("pages, JSON text and repeated shifts; two locations picked by name or id", () => {
  const other = { id: 12, name: "King St", timezone: "America/Toronto" };
  const page1 = { object: "shifts", data: [sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z")], meta: { cursor: { next: "abc" } } };
  const page2 = shifts(sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"), sh(2, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z", { location_id: 12 }));
  const text = [page1, page2, roles, { object: "locations", data: [loc, other] }].map((x) => JSON.stringify(x)).join("\n");
  const r = import7shifts(text);
  assert.equal(r.rows, 2);
  assert.match(r.notes.join(" "), /1 repeated across pages/);
  assert.deepEqual(r.locations.map((l) => l.name).sort(), ["King St", "Queen St"]);
  assert.equal(import7shifts(text, { location: "King St" }).rows, 1);
  assert.equal(import7shifts(text, { location: 12 }).rows, 1);
});

test("a shift that ends before it starts, or a day later, is skipped with its id", () => {
  const r = import7shifts([shifts(sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"), sh(8, "2026-11-02T12:00:00Z", "2026-11-02T11:00:00Z"), sh(9, "2026-11-02T12:00:00Z", "2026-11-03T12:00:00Z")), roles, locations]);
  assert.equal(r.rows, 1);
  assert.match(r.skipped.join(" "), /Shift 8: ends at or before its start/);
  assert.match(r.skipped.join(" "), /Shift 9: ends a day or more after/);
});

test("unrelated JSON is refused with a reason", () => {
  assert.match(import7shifts('{"hello": 1}').notes[0], /No 7shifts shifts/);
  assert.match(import7shifts("").notes[0], /Nothing to read/);
});

test("fetch7shifts follows cursors, finds the one company, sends the token only as a bearer header", async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const u = new URL(url);
    const body = u.pathname === "/v2/companies" ? { data: [{ id: 77 }] }
      : u.pathname.endsWith("/shifts") && !u.searchParams.get("cursor") ? { object: "shifts", data: [sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z")], meta: { cursor: { next: "p2" } } }
      : u.pathname.endsWith("/shifts") ? shifts(sh(2, "2026-11-09T12:00:00Z", "2026-11-09T20:00:00Z"), sh(3, "2026-11-20T12:00:00Z", "2026-11-20T20:00:00Z"))
      : u.pathname.endsWith("/roles") ? roles : locations;
    return { ok: true, status: 200, json: async () => body };
  };
  const got = await fetch7shifts({ token: "t0k", from: "2026-11-02", to: "2026-11-15", fetchImpl: fake });
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c.auth === "Bearer t0k" && !c.url.includes("t0k")));
  assert.match(calls[1].url, /\/v2\/company\/77\/shifts\?/);
  assert.match(decodeURIComponent(calls[1].url), /start\[gte\]=2026-11-01T00:00:00Z/);
  const r = import7shifts(within(got.responses, got.from, got.to));
  assert.equal(r.rows, 2); // the 20 November shift is outside the range
  assert.match(r.notes.join(" "), /2 weeks/);
  await assert.rejects(fetch7shifts({ token: "", from: "2026-11-02", to: "2026-11-15", fetchImpl: fake }), /SEVENSHIFTS_ACCESS_TOKEN/);
  await assert.rejects(fetch7shifts({ token: "x", from: "2026-11-02", to: "2026-11-15", fetchImpl: async () => ({ ok: false, status: 401 }) }), /401 .*access token/);
});

test("CLI: --import-7shifts reads saved responses, --tz and --location apply", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "7shifts-"));
  writeFileSync(join(dir, "s.json"), JSON.stringify(shifts(sh(1, "2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z"))));
  writeFileSync(join(dir, "rl.json"), JSON.stringify(roles) + "\n" + JSON.stringify(locations) + "\n");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [cli, "--import-7shifts", join(dir, "s.json"), "--import-7shifts", join(dir, "rl.json"), "--location", "Queen St"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Mon, 7:00, 15:00, 1, , server/);
  const utc = execFileSync(process.execPath, [cli, "--import-7shifts", join(dir, "s.json"), "--tz", "Europe/London"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(utc, /Mon, 12:00, 20:00, 1, , role 5/);
});
