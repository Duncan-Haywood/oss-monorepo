import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAccrual, readLeaveEnv, leaveYear, leaveBalances, addLeaveUse, removeLeaveUse, setLeaveOpening, leaveCsv } from "./leave.mjs";
import { punch, trimPunches, workedSpans } from "./timeclock.mjs";
import { handler, emptyState } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
// One stretch of `h` hours starting at `iso`, punched by the manager (so no "already clocked in" checks get in the way).
const work = (s, person, iso, h) => { punch(s, person, "in", at(iso), { by: "manager" }); punch(s, person, "out", at(iso) + h * 3600000, { by: "manager" }); };
const row = (rows, name) => rows.find((r) => r.name === name);

test("the rate and the policy are read from the environment, and nothing runs without LEAVE_ACCRUAL", () => {
  assert.equal(parseAccrual(""), null);
  assert.equal(parseAccrual("off"), null);
  assert.equal(parseAccrual("1/30").rate, 1 / 30);
  assert.equal(parseAccrual("1 per 40").rate, 1 / 40);
  assert.equal(parseAccrual("1:52").label, "1 h per 52 h worked");
  assert.equal(parseAccrual("0.05").rate, 0.05);
  assert.match(parseAccrual("lots").error, /not a rate/);
  assert.match(parseAccrual("2/1").error, /not a rate/); // more than an hour per hour is a typo
  assert.equal(readLeaveEnv({}), null);
  const p = readLeaveEnv({ LEAVE_ACCRUAL: "1/30", LEAVE_YEAR_CAP: "48", LEAVE_BALANCE_CAP: "80", LEAVE_CARRYOVER_CAP: "40", LEAVE_YEAR_START: "7-1" });
  assert.deepEqual([p.rate, p.yearCap, p.balanceCap, p.carryCap, p.yearStart, p.name], [1 / 30, 48, 80, 40, "07-01", "Paid sick leave"]);
  const bad = readLeaveEnv({ LEAVE_ACCRUAL: "1/30", LEAVE_YEAR_CAP: "many", LEAVE_YEAR_START: "July" });
  assert.equal(bad.yearCap, null);
  assert.equal(bad.yearStart, "01-01");
  assert.equal(bad.notes.length, 2);
  assert.equal(readLeaveEnv({ LEAVE_ACCRUAL: "1/30", LEAVE_NAME: "PTO<script>" }).name, "PTOscript");
  assert.equal(leaveYear("2026-06-30", "07-01"), 2025);
  assert.equal(leaveYear("2026-07-01", "07-01"), 2026);
});

test("one hour per 30 worked, from closed stretches only, less what was used", () => {
  const s = emptyState(), pol = readLeaveEnv({ LEAVE_ACCRUAL: "1/30" });
  for (let d = 2; d <= 6; d++) work(s, "Ana", `2026-03-0${d}T09:00:00Z`, 6); // 30 h
  work(s, "Ben", "2026-03-02T09:00:00Z", 15);
  punch(s, "Ben", "in", at("2026-03-03T09:00:00Z"), { by: "manager" }); // still on the clock: earns nothing yet
  const now = at("2026-03-03T12:00:00Z") + 4 * 86400000;
  let rows = leaveBalances(s, pol, { nowMs: now });
  assert.equal(row(rows, "Ana").earnedH, 1);
  assert.equal(row(rows, "Ana").workedH, 30);
  assert.equal(row(rows, "Ben").earnedH, 0.5);
  assert.ok(addLeaveUse(s, { person: "Ana", date: "2026-03-09", hours: "0.75" }, "UTC", now).ok);
  assert.match(addLeaveUse(s, { person: "Ana", date: "9 March", hours: 1 }, "UTC", now).error, /YYYY-MM-DD/);
  assert.match(addLeaveUse(s, { person: "Ana", date: "2026-03-09", hours: 30 }, "UTC", now).error, /at most 24/);
  rows = leaveBalances(s, pol, { nowMs: now });
  assert.deepEqual([row(rows, "Ana").usedH, row(rows, "Ana").balanceH], [0.75, 0.25]);
  // Using more than the balance is recorded (the manager decides) but flagged.
  addLeaveUse(s, { person: "Ben", date: "2026-03-04", hours: 2, note: "flu" }, "UTC", now);
  rows = leaveBalances(s, pol, { nowMs: now });
  assert.equal(row(rows, "Ben").balanceH, -1.5);
  assert.match(row(rows, "Ben").flags.join(), /2026-03-04: used 2 h with 1.5 h more than the balance/);
  assert.ok(removeLeaveUse(s, s.leaveUses.find((u) => u.person === "Ben").id));
  assert.equal(row(leaveBalances(s, pol, { nowMs: now }), "Ben").balanceH, 0.5);
  assert.ok(!removeLeaveUse(s, 999));
});

test("the year cap, the balance cap (earning pauses, then resumes after a use) and the carryover cap", () => {
  const pol = readLeaveEnv({ LEAVE_ACCRUAL: "1/30", LEAVE_YEAR_CAP: "5", LEAVE_BALANCE_CAP: "3", LEAVE_CARRYOVER_CAP: "2" });
  const s = emptyState();
  // 40 h a week for 3 weeks in December: 4 h at 1/30, capped at the 3 h balance.
  for (let w = 0; w < 3; w++) for (let d = 0; d < 5; d++) work(s, "Ana", new Date(at("2025-12-01T09:00:00Z") + (w * 7 + d) * 86400000).toISOString(), 8);
  let rows = leaveBalances(s, pol, { nowMs: at("2025-12-24T00:00:00Z") });
  assert.equal(row(rows, "Ana").balanceH, 3);
  assert.equal(row(rows, "Ana").notEarnedH, 1);
  assert.match(row(rows, "Ana").flags[0], /at the 3 h balance cap/);
  // New year: the 3 h are cut to the 2 h carryover cap.
  rows = leaveBalances(s, pol, { nowMs: at("2026-01-05T00:00:00Z") });
  assert.deepEqual([row(rows, "Ana").year, row(rows, "Ana").balanceH, row(rows, "Ana").earnedH], [2026, 2, 0]);
  assert.match(row(rows, "Ana").flags.join(), /1 h over the 2 h carryover cap/);
  // January: use 2 h, then work 240 h (8 h earnable): balance cap 3 stops it at 3, year total 3.
  addLeaveUse(s, { person: "Ana", date: "2026-01-05", hours: 2 }, "UTC", 0);
  for (let d = 0; d < 30; d++) work(s, "Ana", new Date(at("2026-01-06T09:00:00Z") + d * 86400000).toISOString(), 8);
  rows = leaveBalances(s, pol, { nowMs: at("2026-02-10T00:00:00Z") });
  assert.deepEqual([row(rows, "Ana").usedH, row(rows, "Ana").earnedH, row(rows, "Ana").balanceH], [2, 3, 3]);
  // Use 3 more, work another 120 h (4 h earnable): the year cap of 5 leaves 2.
  addLeaveUse(s, { person: "Ana", date: "2026-02-11", hours: 3 }, "UTC", 0);
  for (let d = 0; d < 15; d++) work(s, "Ana", new Date(at("2026-02-12T09:00:00Z") + d * 86400000).toISOString(), 8);
  rows = leaveBalances(s, pol, { nowMs: at("2026-03-01T00:00:00Z") });
  assert.deepEqual([row(rows, "Ana").earnedH, row(rows, "Ana").balanceH], [5, 2]);
  assert.match(row(rows, "Ana").flags.join(), /earned this leave year's 5 h cap/);
});

test("an opening balance carried over from another system, and a leave year that starts in July", () => {
  const pol = readLeaveEnv({ LEAVE_ACCRUAL: "1/40", LEAVE_YEAR_START: "07-01" });
  const s = emptyState();
  work(s, "Ana", "2026-06-29T09:00:00Z", 8); // before the opening balance: replaced by it
  assert.ok(setLeaveOpening(s, "Ana", "12.5", at("2026-06-30T00:00:00Z")).ok);
  assert.match(setLeaveOpening(s, "Ana", "-1", 0).error, /0 to 2000/);
  work(s, "Ana", "2026-06-30T09:00:00Z", 8); // June 30: still leave year 2025
  let r = row(leaveBalances(s, pol, { nowMs: at("2026-06-30T23:00:00Z") }), "Ana");
  assert.deepEqual([r.year, r.balanceH], [2025, 12.7]);
  r = row(leaveBalances(s, pol, { nowMs: at("2026-07-02T00:00:00Z") }), "Ana");
  assert.deepEqual([r.year, r.balanceH, r.earnedH], [2026, 12.7, 0]); // no carryover cap: everything carries
  assert.ok(setLeaveOpening(s, "Ana", "", 0).cleared);
});

test("the punch trim folds dropped stretches into the bank, so the balance survives it", () => {
  const pol = readLeaveEnv({ LEAVE_ACCRUAL: "1/30" });
  const s = emptyState();
  for (let d = 0; d < 20; d++) work(s, "Ana", new Date(at("2026-04-01T09:00:00Z") + d * 86400000).toISOString(), 6); // 120 h
  work(s, "Ben", "2026-04-01T09:00:00Z", 30);
  const now = at("2026-05-01T00:00:00Z");
  const before = leaveBalances(s, pol, { nowMs: now });
  assert.equal(row(before, "Ana").earnedH, 4);
  // Keep only the newest 10 punches (Ana's last 4 stretches and Ben's one): the rest go to the bank.
  assert.equal(trimPunches(s, 10, now), 32);
  assert.equal(s.punches.length, 10);
  assert.equal(workedSpans(s.punches, now).length, 5);
  assert.equal(Object.keys(s.leaveBank.Ana).length, 16);
  assert.deepEqual(leaveBalances(s, pol, { nowMs: now }), before);
  // Nothing to trim: no change.
  assert.equal(trimPunches(s, 10, now), 0);
});

test("the hub: off by default, then balances, recording a use, opening balances and the CSV", async () => {
  const state = emptyState();
  state.published = { weekStart: "2026-11-16", people: [{ name: "Ana" }, { name: "=Ben" }], assignments: [], at: "x", unfilled: 0 };
  const clock = { t: at("2026-11-20T12:00:00Z") };
  const mk = (env) => {
    const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", ...env }, () => clock.t, null);
    return { call: (p, init) => serve(hub, new Request("https://hub.example" + p, init)), post: (p, b) => serve(hub, new Request("https://hub.example" + p, { method: "POST", body: new URLSearchParams(b) })) };
  };
  const off = mk({});
  assert.match(await (await off.call("/admin/leave?key=adm")).text(), /Leave tracking is off/);
  assert.equal((await off.post("/admin/leave-use?key=adm", { name: "Ana", date: "2026-11-18", hours: "4" })).status, 404);
  assert.equal(state.leaveUses.length, 0);
  const h = mk({ LEAVE_ACCRUAL: "1/30", LEAVE_BALANCE_CAP: "40" });
  assert.equal((await h.call("/admin/leave?key=nope")).status, 401);
  work(state, "Ana", "2026-11-16T09:00:00Z", 30);
  let page = await (await h.call("/admin/leave?key=adm")).text();
  assert.match(page, /Paid sick leave balances/);
  assert.match(page, /<td><strong>Ana<\/strong><\/td><td>2026<\/td><td>30\.00<\/td><td>1\.00<\/td><td>0\.00<\/td><td><strong>1\.00<\/strong><\/td>/);
  assert.match(page, /not any state's or city's rule/);
  let r = await h.post("/admin/leave-use?key=adm", { name: "Ana", date: "2026-11-19", hours: "0.5", note: "dentist" });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Recorded 0.5 h for Ana on 2026-11-19/);
  r = await h.post("/admin/leave-use?key=adm", { name: "Ana", date: "", hours: "1" });
  assert.match(decodeURIComponent(r.headers.get("location")), /Not recorded/);
  await h.post("/admin/leave-opening?key=adm", { name: "=Ben", hours: "6" });
  page = await (await h.call("/admin/leave?key=adm")).text();
  assert.match(page, /<td><strong>Ana<\/strong><\/td><td>2026<\/td><td>30\.00<\/td><td>1\.00<\/td><td>0\.50<\/td><td><strong>0\.50<\/strong><\/td>/);
  assert.match(page, /=Ben 6\.00 h/);
  const csv = await (await h.call("/admin/leave.csv?key=adm")).text();
  assert.match(csv, /^person,leave_year,worked_hours/);
  assert.match(csv, /\n'=Ben,2026,0\.00,0\.00,0\.00,6\.00/); // a name typed as a formula cannot run in a spreadsheet
  assert.match(csv, /\nAna,2026-11-19,0\.50,dentist\n/);
  assert.match(await (await h.call("/admin/timesheet?key=adm")).text(), /Paid sick leave balances<\/a>/);
  await h.post("/admin/leave-remove?key=adm", { id: String(state.leaveUses[0].id) });
  assert.equal(state.leaveUses.length, 0);
  assert.equal(leaveCsv([], readLeaveEnv({ LEAVE_ACCRUAL: "1/30" }), {}).split("\n")[0], "person,leave_year,worked_hours,earned_hours,used_hours,balance_hours,not_earned_over_caps,checks");
});
