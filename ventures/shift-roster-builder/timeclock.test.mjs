import { test } from "node:test";
import assert from "node:assert/strict";
import { punch, addPunch, removePunch, onTheClock, timesheet, timesheetCsv, localParts, fromLocal, zoneOf } from "./timeclock.mjs";
import { handler, emptyState } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
// Mon 2026-11-16 week: Ana Mon 09:00-17:00 and Tue 09:00-17:00, Ben Mon 12:00-20:00, one open Wed shift.
const sl = (day, s, e, label = "") => ({ day, startMin: s * 60, endMin: e * 60, label, role: "" });
const WEEK = {
  weekStart: "2026-11-16",
  people: [{ name: "Ana", hours: 16 }, { name: "Ben", hours: 8 }],
  assignments: [{ person: "Ana", slot: sl(0, 9, 17) }, { person: "Ana", slot: sl(1, 9, 17) }, { person: "Ben", slot: sl(0, 12, 20) }, { person: null, slot: sl(2, 9, 17) }],
};

test("time zones: wall clock to instant and back, across a clock change", () => {
  assert.equal(zoneOf("Not/AZone"), "UTC");
  assert.equal(zoneOf(""), "UTC");
  const t = fromLocal("2026-11-16", 9 * 60, "America/Chicago");
  assert.equal(new Date(t).toISOString(), "2026-11-16T15:00:00.000Z");
  assert.deepEqual(localParts(t, "America/Chicago"), { date: "2026-11-16", min: 540 });
  // 2026-03-08 02:30 does not exist in Chicago (spring forward); 01:30 on 2026-11-01 happens twice.
  const summer = fromLocal("2026-07-01", 9 * 60, "America/Chicago");
  assert.equal(new Date(summer).toISOString(), "2026-07-01T14:00:00.000Z");
  const twice = fromLocal("2026-11-01", 90, "America/Chicago");
  assert.equal(localParts(twice, "America/Chicago").min, 90);
});

test("punches: a double tap is refused, an out needs an in", () => {
  const s = {};
  assert.ok(punch(s, "Ana", "out", at("2026-11-16T08:58:00Z")).error);
  assert.ok(punch(s, "Ana", "in", at("2026-11-16T08:58:00Z")).ok);
  assert.match(punch(s, "Ana", "in", at("2026-11-16T08:59:00Z")).error, /already clocked in/);
  assert.equal(onTheClock(s.punches, at("2026-11-16T12:00:00Z")).get("Ana").at, at("2026-11-16T08:58:00Z"));
  assert.ok(punch(s, "Ana", "out", at("2026-11-16T17:01:00Z")).ok);
  assert.equal(onTheClock(s.punches, at("2026-11-16T18:00:00Z")).size, 0);
  assert.ok(punch(s, "Ana", "nap", 0).error);
  // An in older than 16 hours is no longer "on the clock", so the next morning's clock-in is allowed.
  punch(s, "Ben", "in", at("2026-11-16T12:00:00Z"));
  assert.ok(punch(s, "Ben", "in", at("2026-11-17T12:00:00Z")).ok);
});

test("timesheet: on time, late, early, past the end, no punch, unscheduled and a missing clock-out", () => {
  const s = {};
  punch(s, "Ana", "in", at("2026-11-16T08:58:00Z")); punch(s, "Ana", "out", at("2026-11-16T12:30:00Z")); // lunch out
  punch(s, "Ana", "in", at("2026-11-16T13:00:00Z")); punch(s, "Ana", "out", at("2026-11-16T16:40:00Z")); // left 20 min early
  punch(s, "Ben", "in", at("2026-11-16T12:12:00Z")); punch(s, "Ben", "out", at("2026-11-16T20:30:00Z")); // 12 min late, 30 past
  punch(s, "Ben", "in", at("2026-11-18T10:00:00Z")); punch(s, "Ben", "out", at("2026-11-18T14:00:00Z")); // Wed, not his shift
  punch(s, "Ben", "in", at("2026-11-19T09:00:00Z")); // never clocked out
  const ts = timesheet(s.punches, WEEK, { tz: "UTC", nowMs: at("2026-11-21T12:00:00Z") });
  const ana = ts.people.find((p) => p.name === "Ana"), ben = ts.people.find((p) => p.name === "Ben");
  assert.equal(ana.rows.length, 2);
  assert.ok(Math.abs(ana.workedH - (3.5333 + 3.6667)) < 0.01, String(ana.workedH));
  assert.equal(ana.scheduledH, 16);
  assert.deepEqual(ana.rows[0].flags, []); // 2 min early is inside the grace
  assert.deepEqual(ana.rows[1].flags, ["left 20 min early"]);
  assert.deepEqual(ana.noShow.map((n) => n.day), [1]); // Tuesday, no punch
  assert.deepEqual(ben.rows[0].flags, ["late 12 min", "30 min past shift end"]);
  assert.deepEqual(ben.rows[1].flags, ["no scheduled shift"]);
  assert.equal(ben.missing.length, 1);
  assert.equal(ben.missing[0].kind, "no-out");
  assert.ok(Math.abs(ben.workedH - (8.3 + 4)) < 0.01);
  const csv = timesheetCsv(ts);
  assert.match(csv, /^person,date,clock_in,clock_out,hours,scheduled_shift,flags\n/);
  assert.match(csv, /Ben,2026-11-16,12:12,20:30,8\.30,Mon 12:00-20:00,late 12 min; 30 min past shift end/);
  assert.match(csv, /Ben,2026-11-19,09:00,,,,missing clock-out/);
  assert.match(csv, /Ana,TOTAL,,,7\.20,scheduled 16\.00,1 shift\(s\) with no punch/);
  // A name that looks like a formula is written as text.
  const evil = {}; punch(evil, "=HYPERLINK(1)", "in", at("2026-11-16T09:00:00Z")); punch(evil, "=HYPERLINK(1)", "out", at("2026-11-16T10:00:00Z"));
  assert.match(timesheetCsv(timesheet(evil.punches, WEEK, { nowMs: at("2026-11-21T00:00:00Z") })), /\n'=HYPERLINK\(1\),2026-11-16/);
});

test("timesheet in the site's zone: a Chicago morning shift matches punches stored in UTC", () => {
  const s = {};
  punch(s, "Ana", "in", fromLocal("2026-11-16", 9 * 60 + 7, "America/Chicago"));
  punch(s, "Ana", "out", fromLocal("2026-11-16", 17 * 60, "America/Chicago"));
  const ts = timesheet(s.punches, WEEK, { tz: "America/Chicago", nowMs: at("2026-11-17T00:00:00Z") });
  const ana = ts.people.find((p) => p.name === "Ana");
  assert.deepEqual(ana.rows[0].flags, ["late 7 min"]);
  assert.deepEqual(ana.noShow, []); // Tuesday has not started yet
  const utc = timesheet(s.punches, WEEK, { tz: "UTC", nowMs: at("2026-11-17T00:00:00Z") });
  assert.notDeepEqual(utc.people.find((p) => p.name === "Ana").rows[0].flags, ["late 7 min"]); // the zone matters
});

test("a manager's missed punch is marked, a future one refused, a wrong one removable; over-40 is shown", () => {
  const s = {};
  const now = at("2026-11-22T20:00:00Z");
  assert.ok(addPunch(s, { person: "Ana", date: "2026-11-16", time: "9:00", kind: "in" }, "UTC", now).ok);
  assert.ok(addPunch(s, { person: "Ana", date: "2026-11-16", time: "25:00", kind: "out" }, "UTC", now).error);
  assert.ok(addPunch(s, { person: "Ana", date: "2026-11-30", time: "09:00", kind: "out" }, "UTC", now).error);
  const r = addPunch(s, { person: "Ana", date: "2026-11-16", time: "17:00", kind: "out" }, "UTC", now);
  const ts = timesheet(s.punches, WEEK, { tz: "UTC", nowMs: now });
  assert.deepEqual(ts.people.find((p) => p.name === "Ana").rows[0].flags, ["punch added by manager"]);
  assert.ok(removePunch(s, r.punch.id));
  assert.ok(!removePunch(s, r.punch.id));
  // Five 9-hour days: 45 worked, 5 over 40.
  const s2 = {};
  for (let d = 16; d <= 20; d++) { punch(s2, "Ana", "in", at(`2026-11-${d}T08:00:00Z`)); punch(s2, "Ana", "out", at(`2026-11-${d}T17:00:00Z`)); }
  assert.equal(timesheet(s2.punches, WEEK, { nowMs: now }).people.find((p) => p.name === "Ana").overH, 5);
});

test("the hub: staff clock in and out on the team page, the manager reads and exports the timesheet", async () => {
  let clockNow = at("2026-11-16T08:55:00Z");
  const state = emptyState();
  state.weekStart = "2026-11-16";
  state.published = { ...structuredClone(WEEK), at: "2026-11-15T12:00:00.000Z", unfilled: 1 };
  let saves = 0;
  const hub = handler(state, () => { saves++; }, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC" }, () => clockNow, null);
  const call = (path, init) => serve(hub, new Request("https://hub.example" + path, init));
  const post = (path, body) => call(path, { method: "POST", body: new URLSearchParams(body) });
  let page = await (await call("/team?t=tm")).text();
  assert.match(page, /Clock in or out/);
  assert.match(page, /On the clock now: nobody/);
  assert.equal((await post("/team/punch?t=tm", { name: "Ana", kind: "in" })).status, 200);
  assert.equal((await post("/team/punch?t=tm", { name: "Ana", kind: "in" })).status, 400);
  assert.equal((await post("/team/punch?t=tm", { name: "Zed", kind: "in" })).status, 400);
  assert.equal((await post("/team/punch?t=wrong", { name: "Ana", kind: "in" })).status, 401);
  page = await (await call("/team?t=tm")).text();
  assert.match(page, /On the clock now: Ana since 08:55/);
  assert.doesNotMatch(page, /23\.17|wage/i);
  clockNow = at("2026-11-16T17:10:00Z");
  assert.equal((await post("/team/punch?t=tm", { name: "Ana", kind: "out" })).status, 200);
  assert.equal(saves, 2);
  assert.match(await (await call("/admin?key=adm")).text(), /Timesheet: hours worked against the schedule<\/a> \(2 punch/);
  assert.equal((await call("/admin/timesheet?key=nope")).status, 401);
  const sheet = await (await call("/admin/timesheet?key=adm")).text();
  assert.match(sheet, /Timesheet, week of 2026-11-16/);
  assert.match(sheet, /<td><strong>Ana<\/strong><\/td><td>8\.25<\/td><td>16\.00<\/td>/);
  assert.match(sheet, /10 min past shift end/);
  const added = await post("/admin/punch-add?key=adm", { name: "Ben", date: "2026-11-16", time: "12:00", kind: "in", week: "2026-11-16" });
  assert.equal(added.status, 303);
  assert.match(decodeURIComponent(added.headers.get("location")), /Added a clock-in for Ben/);
  const csv = await call("/admin/timesheet.csv?key=adm&week=2026-11-16");
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /Ana,2026-11-16,08:55,17:10,8\.25,Mon 09:00-17:00,10 min past shift end/);
  assert.match(text, /Ben,2026-11-16,12:00,,,Mon 12:00-20:00,on the clock now; punch added by manager/);
  // TIME_CLOCK=0 takes it all away.
  const offState = { ...state };
  const hub2 = handler(offState, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIME_CLOCK: "0" }, () => clockNow, null);
  assert.doesNotMatch(await (await serve(hub2, new Request("https://hub.example/team?t=tm"))).text(), /Clock in/);
  assert.equal((await serve(hub2, new Request("https://hub.example/admin/timesheet?key=adm"))).status, 404);
});
