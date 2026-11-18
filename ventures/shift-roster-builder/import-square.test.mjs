import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { importSquare, fetchSquare, within, readSquareTime, looksLikeSquare, SQUARE_VERSION } from "./import-square.mjs";
import { looksLikeWhenIWork } from "./import-wheniwork.mjs";
import { parseShifts } from "./calc.mjs";

// Invented rows in the shape of Square's Labor API (its published OpenAPI definition, read 2026-11-16): a ScheduledShift
// with draft_shift_details (always) and published_shift_details (once published), RFC 3339 times with the location's
// offset, ids for job, location and team member. No real Square account or data was used.
const jobs = { jobs: [{ id: "J-BAR", title: "Barista", is_tip_eligible: true }, { id: "J-KIT", title: "Kitchen", is_tip_eligible: false }] };
const locations = { locations: [{ id: "L1", name: "Main St", timezone: "America/Chicago", status: "ACTIVE" }, { id: "L2", name: "Harbour", timezone: "America/Chicago", status: "ACTIVE" }] };
const det = (start, end, extra = {}) => ({ team_member_id: "TM1", location_id: "L1", job_id: "J-BAR", start_at: start, end_at: end, is_deleted: false, timezone: "America/Chicago", ...extra });
const pubd = (id, start, end, extra = {}) => ({ id, version: 2, draft_shift_details: det(start, end, extra), published_shift_details: det(start, end, extra) });
const draftOnly = (id, start, end, extra = {}) => ({ id, version: 1, draft_shift_details: det(start, end, extra) });
const page = (...list) => ({ scheduled_shifts: list });
// Mon 2 Nov 2026, Chicago (CST, -06:00).
const MON = (h, m = "00") => `2026-11-02T${h}:${m}:00-06:00`;

test("published shifts read on the location's clock, job and location names from their responses", () => {
  const r = importSquare([page(pubd("a", MON("07"), MON("15")), pubd("b", MON("07"), MON("15")), pubd("c", MON("15"), MON("23"), { job_id: "J-KIT" })), jobs, locations]);
  assert.equal(r.rows, 3);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , barista/);
  assert.match(r.shiftsText, /Mon, 15:00, 23:00, 1, , kitchen/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  assert.match(r.notes[0], /Read 3 Square scheduled shifts/);
});

test("summer and winter offsets give the same 7am; the length uses the instants across the clock change", () => {
  const r = importSquare([page(pubd("s", "2026-07-06T07:00:00-05:00", "2026-07-06T15:00:00-05:00"), pubd("w", MON("07"), MON("15"))), jobs]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , barista/);
  assert.match(r.notes.join(" "), /offsets -05:00, -06:00/);
  // 23:00 CDT to 06:00 CST on 31 Oct / 1 Nov 2026 is 8 hours.
  const dst = importSquare([page(pubd("n", "2026-10-31T23:00:00-05:00", "2026-11-01T06:00:00-06:00"))]);
  assert.equal(dst.rows, 1);
  assert.match(dst.shiftsText, /Sat, 23:00, 6:00, 1/);
});

test("published version wins by default; unpublished edits and pending deletes are noted, --square-latest reads drafts", () => {
  const edited = { id: "e", draft_shift_details: det(MON("09"), MON("17")), published_shift_details: det(MON("07"), MON("15")) };
  const goingAway = { id: "g", draft_shift_details: det(MON("07"), MON("15"), { is_deleted: true }), published_shift_details: det(MON("07"), MON("15")) };
  const r = importSquare([page(edited, goingAway), jobs]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , barista/);
  assert.match(r.notes.join(" "), /1 published shift has unpublished edits/);
  assert.match(r.notes.join(" "), /deleted in a draft but still posted/);
  const latest = importSquare([page(edited, goingAway), jobs], { latest: true });
  assert.match(latest.shiftsText, /Mon, 9:00, 17:00, 1, , barista/);
  assert.doesNotMatch(latest.shiftsText, / 7:00/);
  assert.equal(latest.counts.deleted, 1);
});

test("never-published drafts count unless --no-drafts; deleted drafts never; unassigned shifts count as needed", () => {
  const list = [pubd("a", MON("07"), MON("15")), draftOnly("b", MON("07"), MON("15")), draftOnly("c", MON("07"), MON("15"), { is_deleted: true }), pubd("d", MON("07"), MON("15"), { team_member_id: undefined })];
  const r = importSquare([page(...list), jobs]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 3, , barista/);
  assert.equal(r.counts.open, 1);
  assert.match(r.notes.join(" "), /1 never-published shift read from its draft/);
  assert.match(r.notes.join(" "), /1 deleted shift left out/);
  const pubOnly = importSquare([page(...list), jobs], { drafts: false });
  assert.match(pubOnly.shiftsText, /Mon, 7:00, 15:00, 2, , barista/);
  assert.match(pubOnly.notes.join(" "), /never-published shift left out/);
});

test("two locations: picked by name or by Square id", () => {
  const list = [pubd("a", MON("07"), MON("15")), pubd("b", MON("11"), MON("19"), { location_id: "L2" })];
  const all = importSquare([page(...list), jobs, locations]);
  assert.deepEqual(all.locations.map((l) => l.name).sort(), ["Harbour", "Main St"]);
  const harbour = importSquare([page(...list), jobs, locations], { location: "Harbour" });
  assert.match(harbour.shiftsText, /Mon, 11:00, 19:00, 1/);
  assert.doesNotMatch(harbour.shiftsText, /7:00/);
  const byId = importSquare([page(...list), jobs, locations], { location: "L2" });
  assert.equal(byId.shiftsText, harbour.shiftsText);
});

test("a time in UTC is moved to the location's zone; with no zone it is read as UTC and said so", () => {
  assert.deepEqual(readSquareTime("2026-11-02T13:00:00Z", "America/Chicago").time, "07:00");
  assert.equal(readSquareTime("2026-11-02T07:00:00-06:00").time, "07:00");
  assert.equal(readSquareTime("Mon, 02 Nov 2026 07:00:00 -0600"), null, "RFC 2822 is When I Work's form, not Square's");
  const r = importSquare([page({ id: "z", published_shift_details: det("2026-11-02T13:00:00Z", "2026-11-02T21:00:00Z") })]);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1/);
  const bare = importSquare([page({ id: "z", published_shift_details: det("2026-11-02T13:00:00Z", "2026-11-02T21:00:00Z", { timezone: undefined }) })]);
  assert.match(bare.shiftsText, /Mon, 13:00, 21:00, 1/);
  assert.match(bare.notes.join(" "), /read as UTC clock times/);
});

test("damaged rows are skipped with their id; repeats across files count once; jobs missing are noted", () => {
  const r = importSquare([page(pubd("a", MON("07"), MON("15")), pubd("bad", MON("15"), MON("07")), pubd("x", "soon", MON("15"))), page(pubd("a", MON("07"), MON("15")))]);
  assert.equal(r.rows, 1);
  assert.ok(r.skipped.some((s) => /Shift bad: ends at or before/.test(s)));
  assert.ok(r.skipped.some((s) => /Shift x: could not read the start/.test(s)));
  assert.match(r.notes[0], /1 repeated across files counted once/);
  assert.match(r.notes.join(" "), /Jobs are shown as ids/);
  assert.match(r.shiftsText, /job j-bar|job J-BAR/i);
});

test("error responses and the wrong vendor are refused with a reason", () => {
  assert.match(importSquare({ errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED", detail: "This request could not be authorized." }] }).notes[0], /error, not shifts: This request could not be authorized/);
  assert.match(importSquare([jobs, locations]).notes[0], /No Square scheduled shifts/);
  assert.match(importSquare("").notes[0], /Nothing to read/);
  const wiw = JSON.stringify({ shifts: [{ id: 1, start_time: "Mon, 02 Nov 2026 07:00:00 -0600", end_time: "Mon, 02 Nov 2026 15:00:00 -0600" }] });
  assert.equal(importSquare(wiw).rows, 0);
  assert.equal(looksLikeSquare(wiw), false);
  const sq = JSON.stringify(page(pubd("a", MON("07"), MON("15"))));
  assert.equal(looksLikeSquare([sq, JSON.stringify(locations)]), true);
  // Square's locations response alone looks like When I Work's to that check, which is why the page asks Square first.
  assert.equal(looksLikeWhenIWork(JSON.stringify(locations)), false);
});

test("fetch: workday search paged by cursor, jobs paged, locations; bearer and Square-Version headers; trimmed to dates", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const u = new URL(url);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (u.pathname === "/v2/labor/scheduled-shifts/search") {
      const body = JSON.parse(init.body);
      if (!body.cursor) return ok({ scheduled_shifts: [pubd("a", MON("07"), MON("15")), pubd("early", "2026-11-01T07:00:00-06:00", "2026-11-01T15:00:00-06:00")], cursor: "c2" });
      return ok({ scheduled_shifts: [pubd("b", MON("15"), MON("23"), { job_id: "J-KIT" })] });
    }
    if (u.pathname === "/v2/team-members/jobs") return ok(u.searchParams.get("cursor") ? { jobs: [jobs.jobs[1]] } : { jobs: [jobs.jobs[0]], cursor: "j2" });
    if (u.pathname === "/v2/locations") return ok(locations);
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const got = await fetchSquare({ token: "tok", from: "2026-11-02", to: "2026-11-08", fetchImpl });
  const searches = calls.filter((c) => c.url.includes("scheduled-shifts"));
  assert.equal(searches.length, 2);
  const body = JSON.parse(searches[0].init.body);
  assert.deepEqual(body.query.filter.workday, { date_range: { start_date: "2026-11-02", end_date: "2026-11-08" }, match_scheduled_shifts_by: "INTERSECTION" });
  assert.equal(body.limit, 50);
  assert.equal(JSON.parse(searches[1].init.body).cursor, "c2");
  assert.equal(searches[0].init.method, "POST");
  assert.equal(searches[0].init.headers.Authorization, "Bearer tok");
  assert.equal(searches[0].init.headers["Square-Version"], SQUARE_VERSION);
  assert.ok(calls.every((c) => new URL(c.url).host === "connect.squareup.com"));
  assert.equal(calls.filter((c) => c.url.includes("/jobs")).length, 2);
  const r = importSquare(within(got.responses, got.from, got.to));
  assert.equal(r.rows, 2);
  assert.match(r.shiftsText, /Mon, 15:00, 23:00, 1, , kitchen/);
  assert.doesNotMatch(r.shiftsText, /Sun/);
  await assert.rejects(fetchSquare({ from: "2026-11-02", to: "2026-11-08", fetchImpl }), /SQUARE_ACCESS_TOKEN/);
  await assert.rejects(fetchSquare({ token: "t", from: "2026-11-08", to: "2026-11-02", fetchImpl }), /before/);
  const denied = async () => ({ ok: false, status: 403, json: async () => ({ errors: [{ code: "INSUFFICIENT_SCOPES" }] }) });
  await assert.rejects(fetchSquare({ token: "t", from: "2026-11-02", to: "2026-11-08", fetchImpl: denied }), /403.*INSUFFICIENT_SCOPES.*TIMECARDS_READ/);
});

test("CLI: --import-square with --location, and --fetch-square without a token", () => {
  const dir = mkdtempSync(join(tmpdir(), "sq-"));
  writeFileSync(join(dir, "s.json"), JSON.stringify(page(pubd("a", MON("07"), MON("15")), pubd("b", MON("11"), MON("19"), { location_id: "L2" }))));
  writeFileSync(join(dir, "jl.json"), JSON.stringify(jobs) + "\n" + JSON.stringify(locations) + "\n");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [cli, "--import-square", join(dir, "s.json"), "--import-square", join(dir, "jl.json"), "--location", "Harbour"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Mon, 11:00, 19:00, 1, , barista/);
  assert.doesNotMatch(out, /7:00/);
  assert.throws(() => execFileSync(process.execPath, [cli, "--fetch-square", "--from", "2026-11-02", "--to", "2026-11-08"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SQUARE_ACCESS_TOKEN: "" } }), /SQUARE_ACCESS_TOKEN/);
});
