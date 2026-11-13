import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importWhenIWork, fetchWhenIWork, within, readWiwTime, looksLikeWhenIWork } from "./import-wheniwork.mjs";
import { import7shifts } from "./import-7shifts.mjs";
import { parseShifts } from "./calc.mjs";

// Invented rows in the shape of When I Work's API v2 (its published OpenAPI definition, read 2026-11-13): RFC 2822
// times with the offset written in, ids for position and location, user_id 0 for an open shift, published flag.
// No real When I Work account or data was used.
const positions = { positions: [{ id: 5, name: "Server", color: "cc0000", sort: 1 }, { id: 6, name: "Cook", color: "00cc00", sort: 2 }] };
const locations = { locations: [{ id: 11, name: "Front of House", is_deleted: false }, { id: 12, name: "Lake St", is_deleted: false }] };
const sh = (id, start, end, extra = {}) => ({ id, account_id: 1, user_id: 100 + id, location_id: 11, position_id: 5, site_id: 0, start_time: start, end_time: end, break_time: 0.5, published: true, is_open: false, notes: "", ...extra });
const shifts = (...list) => ({ shifts: list, repeating_shifts: [], shiftchains: [] });
// Mon 2 Nov 2026, Chicago (CST, -0600).
const MON = (h, m = "00") => `Mon, 02 Nov 2026 ${h}:${m}:00 -0600`;

test("times are read on the shift's own clock; position and location names from their responses", () => {
  const r = importWhenIWork([shifts(sh(1, MON("07"), MON("15")), sh(2, MON("07"), MON("15")), sh(3, MON("15"), MON("23"), { position_id: 6 })), positions, locations]);
  assert.equal(r.rows, 3);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , server/);
  assert.match(r.shiftsText, /Mon, 15:00, 23:00, 1, , cook/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  assert.match(r.notes[0], /Read 3 When I Work shifts/);
});

test("summer offset and winter offset give the same wall clock", () => {
  // 6 Jul 2026 is a Monday in CDT (-0500); the digits are the clock, so it is the same 7am shift.
  const r = importWhenIWork([shifts(sh(1, "Mon, 06 Jul 2026 07:00:00 -0500", "Mon, 06 Jul 2026 15:00:00 -0500"), sh(2, MON("07"), MON("15"))), positions]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , server/);
  assert.match(r.notes.join(" "), /offsets -0500, -0600/);
});

test("an overnight shift keeps its start day; the length uses the offsets", () => {
  const r = importWhenIWork([shifts(sh(1, "Sat, 07 Nov 2026 22:00:00 -0600", "Sun, 08 Nov 2026 02:00:00 -0600")), positions]);
  assert.match(r.shiftsText, /Sat, 22:00, 2:00, 1/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  // The night clocks go back (1 Nov 2026, US): 23:00 CDT to 06:00 CST is 8 hours, still under a day.
  const dst = importWhenIWork([shifts(sh(2, "Sat, 31 Oct 2026 23:00:00 -0500", "Sun, 01 Nov 2026 06:00:00 -0600"))]);
  assert.equal(dst.rows, 1);
});

test("open shifts count as needed; deleted ids and unpublished shifts on request", () => {
  const list = [
    sh(1, MON("07"), MON("15")),
    sh(2, MON("07"), MON("15"), { user_id: 0, is_open: true }),
    sh(3, MON("07"), MON("15"), { published: false }),
    sh(4, MON("07"), MON("15")),
  ];
  const r = importWhenIWork([{ ...shifts(...list), deleted_ids: [4] }, positions]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 3, , server/);
  assert.equal(r.counts.open, 1);
  assert.equal(r.counts.deleted, 1);
  assert.match(r.notes.join(" "), /1 open shift with nobody on it counted as needed/);
  assert.match(r.notes.join(" "), /1 unpublished shift read as planned/);
  const noDrafts = importWhenIWork([{ ...shifts(...list), deleted_ids: [4] }, positions], { drafts: false });
  assert.match(noDrafts.shiftsText, /Mon, 7:00, 15:00, 2, , server/);
});

test("two locations: listed, one picked by name or id", () => {
  const list = [sh(1, MON("07"), MON("15")), sh(2, MON("09"), MON("17"), { location_id: 12 }), sh(3, MON("09"), MON("17"), { location_id: 12 })];
  const all = importWhenIWork([shifts(...list), positions, locations]);
  assert.deepEqual(all.locations.map((l) => [l.name, l.rows]).sort(), [["Front of House", 1], ["Lake St", 2]]);
  for (const pick of ["Lake St", 12]) {
    const r = importWhenIWork([shifts(...list), positions, locations], { location: pick });
    assert.equal(r.rows, 2, String(pick));
    assert.match(r.shiftsText, /Mon, 9:00, 17:00, 2, , server/);
    assert.doesNotMatch(r.shiftsText, /Mon, 7:00/);
  }
});

test("damaged rows are skipped with their id; repeats count once; missing names noted", () => {
  const r = importWhenIWork([
    JSON.stringify(shifts(sh(1, MON("07"), MON("15")), sh(2, MON("15"), MON("07")), sh(3, "next tuesday", MON("15")), sh(4, MON("07"), "Wed, 04 Nov 2026 08:00:00 -0600"))),
    JSON.stringify(shifts(sh(1, MON("07"), MON("15")))),
  ]);
  assert.equal(r.rows, 1);
  assert.equal(r.skipped.length, 3);
  assert.match(r.skipped.join("; "), /Shift 2: ends at or before its start/);
  assert.match(r.skipped.join("; "), /Shift 3: could not read the start/);
  assert.match(r.skipped.join("; "), /Shift 4: ends a day or more after/);
  assert.match(r.notes.join(" "), /1 repeated across files counted once/);
  assert.match(r.notes.join(" "), /Positions are shown as numbers/);
  assert.match(r.shiftsText, /position 5/);
});

test("nothing to read, or the wrong JSON, says what to save", () => {
  assert.match(importWhenIWork([positions]).notes[0], /GET \/2\/shifts/);
  assert.match(importWhenIWork("").notes[0], /Nothing to read/);
  // Several responses saved one per line in one file.
  const r = importWhenIWork(JSON.stringify(shifts(sh(1, MON("07"), MON("15")))) + "\n" + JSON.stringify(positions));
  assert.match(r.shiftsText, /server/);
});

test("time reader: RFC 2822 as documented, single-digit hours, ISO 8601, bad dates", () => {
  assert.deepEqual(readWiwTime("Mon, 08 May 2023 08:30:00 -0600"), { date: "2023-05-08", time: "08:30", ms: Date.parse("2023-05-08T14:30:00Z"), offset: "-0600" });
  assert.equal(readWiwTime("Mon, 08 May 2023 9:30:00 -0600").time, "09:30");
  assert.equal(readWiwTime("2019-05-16T06:57:28+05:00").ms, Date.parse("2019-05-16T01:57:28Z"));
  assert.equal(readWiwTime("Thu, 31 Apr 2026 08:00:00 -0600"), null);
  assert.equal(readWiwTime("Mon, 08 Foo 2023 08:30:00 -0600"), null);
});

test("the page tells When I Work JSON from 7shifts JSON", () => {
  assert.equal(looksLikeWhenIWork([JSON.stringify(shifts(sh(1, MON("07"), MON("15"))))]), true);
  assert.equal(looksLikeWhenIWork([JSON.stringify(positions)]), true);
  const seven = JSON.stringify({ object: "shifts", data: [{ id: 1, start: "2026-11-02T12:00:00Z", end: "2026-11-02T20:00:00Z", location_id: 1 }] });
  assert.equal(looksLikeWhenIWork([seven]), false);
  // And neither reader takes the other's file.
  assert.equal(importWhenIWork([seven]).rows, 0);
  assert.equal(import7shifts([JSON.stringify(shifts(sh(1, MON("07"), MON("15"))))]).rows, 0);
});

test("fetch: one call per endpoint, bearer and W-UserId headers, range padded, then trimmed to local dates", async () => {
  const calls = [];
  const body = {
    "/2/shifts": { ...shifts(sh(1, "Sun, 01 Nov 2026 23:00:00 -0600", "Mon, 02 Nov 2026 06:00:00 -0600"), sh(2, MON("07"), MON("15")), sh(3, "Sun, 08 Nov 2026 07:00:00 -0600", "Sun, 08 Nov 2026 15:00:00 -0600")), deleted_ids: [9] },
    "/2/positions": positions,
    "/2/locations": locations,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), headers: init.headers });
    return { ok: true, status: 200, json: async () => body[new URL(url).pathname] };
  };
  const got = await fetchWhenIWork({ token: "tok", userId: 77, from: "2026-11-02", to: "2026-11-07", fetchImpl });
  assert.deepEqual(calls.map((c) => c.url.pathname), ["/2/shifts", "/2/positions", "/2/locations"]);
  assert.ok(calls.every((c) => c.url.origin === "https://api.wheniwork.com" && c.headers.Authorization === "Bearer tok" && c.headers["W-UserId"] === "77"));
  const p = calls[0].url.searchParams;
  assert.equal(p.get("start"), "2026-11-01T00:00:00Z");
  assert.equal(p.get("end"), "2026-11-09T00:00:00Z");
  for (const k of ["unpublished", "include_open", "include_allopen", "deleted"]) assert.equal(p.get(k), "true", k);
  const r = importWhenIWork(within(got.responses, got.from, got.to));
  assert.equal(r.rows, 1); // Sunday 1 Nov and Sunday 8 Nov are outside 2-7 Nov
  await assert.rejects(fetchWhenIWork({ from: "2026-11-02", to: "2026-11-07", fetchImpl }), /WHENIWORK_TOKEN/);
  await assert.rejects(fetchWhenIWork({ token: "t", from: "2026-11-07", to: "2026-11-02", fetchImpl }), /before/);
  const denied = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(fetchWhenIWork({ token: "t", from: "2026-11-02", to: "2026-11-07", fetchImpl: denied }), /403.*rate limit/);
});

test("CLI: --import-wheniwork with several files and --location", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "wiw-"));
  writeFileSync(join(dir, "s.json"), JSON.stringify(shifts(sh(1, MON("07"), MON("15")), sh(2, MON("09"), MON("17"), { location_id: 12 }))));
  writeFileSync(join(dir, "pl.json"), JSON.stringify(positions) + "\n" + JSON.stringify(locations) + "\n");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [cli, "--import-wheniwork", join(dir, "s.json"), "--import-wheniwork", join(dir, "pl.json"), "--location", "Lake St"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Mon, 9:00, 17:00, 1, , server/);
  assert.doesNotMatch(out, /Mon, 7:00/);
  assert.throws(() => execFileSync(process.execPath, [cli, "--fetch-wheniwork", "--from", "2026-11-02", "--to", "2026-11-07"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WHENIWORK_TOKEN: "" } }), /WHENIWORK_TOKEN/);
});
