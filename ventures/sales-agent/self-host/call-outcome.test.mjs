import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent, MAX_TRIES } from "./agent.mjs";
import { runDaily } from "../daily.mjs";
import { runPrep } from "../prep.mjs";
import { buildPlan, toCsv } from "../../sales-cadence-builder/calc.mjs";

// A call has an outcome, not just "done": Spoke or Voicemail ends the step, No answer brings it back the next business
// day (up to MAX_TRIES tries), and call prep lists every try. Real Sales Cadence Builder plan (calls on Wed 2026-10-28
// and Wed 2026-11-04); no mail server.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const tasks = toCsv(plan.tasks);
const call = plan.tasks.find((t) => t.email === "dana@brightline.example" && t.channel === "call");
const li = plan.tasks.find((t) => t.email === "dana@brightline.example" && t.channel === "linkedin");
const k = `${call.email}|call|${call.step}`;
const keys = (d) => d.queue.map((q) => `${q.email}|${q.channel}|${q.step}`);
const H = { ADMIN_TOKEN: "x".repeat(16), SENT_BOX: "off" };
const at = (dir, day) => createAgent({ ...H, DATA_DIR: dir }, { now: () => Date.parse(day + "T17:00:00Z") });

test("plan facts the other tests rely on", () => {
  assert.equal(call.date, "2026-10-28");
  assert.equal(new Date(call.date).getUTCDay(), 3, "a Wednesday");
  assert.equal(MAX_TRIES, 3);
});

test("No answer brings the call back the next business day, until the third try ends it", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-call-"));
  const wed = at(dir, "2026-10-28");
  wed.daily({ tasks, maxOverdueDays: 30 });
  const r1 = wed.markDone({ email: call.email, step: call.step, outcome: "no_answer" });
  assert.deepEqual(r1, { ok: true, done: false, changed: true, outcome: "no_answer", tries: 1, retry_on: "2026-10-29" });
  assert.equal(wed.markDone({ email: call.email, step: call.step, outcome: "no_answer" }).changed, false, "a second no-answer the same day is a slip, not a try");
  const same = wed.daily({});
  assert.ok(!keys(same).includes(k), "off today's queue once it rang out");
  assert.equal(same.doneToday[0].outcome, "no_answer");

  const thu = at(dir, "2026-10-29").daily({ maxOverdueDays: 30 });
  const q = thu.queue.find((x) => `${x.email}|${x.channel}|${x.step}` === k);
  assert.ok(q, "back the next business day");
  assert.equal(q.overdue, false, "due on the retry day, not overdue against the plan date");
  assert.equal(q.planned, "2026-10-28");
  assert.equal(q.tries, 1);
  assert.match(thu.brief, /try 2: no answer once, last 2026-10-28/);

  assert.equal(at(dir, "2026-10-29").markDone({ email: call.email, step: call.step, outcome: "no_answer" }).retry_on, "2026-10-30");
  const r3 = at(dir, "2026-10-30").markDone({ email: call.email, step: call.step, outcome: "no_answer" });
  assert.equal(r3.done, true, "three tries without an answer: the cadence moves on");
  assert.equal(r3.retry_on, undefined);
  for (const day of ["2026-11-02", "2026-11-03"]) assert.ok(!keys(at(dir, day).daily({ maxOverdueDays: 30 })).includes(k), `not queued on ${day}`);
  assert.equal(at(dir, "2026-11-02").markDone({ email: call.email, step: call.step, outcome: "spoke" }).changed, false, "a finished step takes no more marks");
});

test("a Friday no-answer comes back on Monday; Undo takes back only the latest mark", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-call-"));
  const fri = at(dir, "2026-10-30");
  fri.daily({ tasks, maxOverdueDays: 30 });
  assert.equal(fri.markDone({ email: call.email, step: call.step, outcome: "no_answer" }).retry_on, "2026-11-02");
  assert.ok(!keys(at(dir, "2026-10-31").daily({ maxOverdueDays: 30 })).includes(k), "not on Saturday");
  const mon = at(dir, "2026-11-02");
  assert.ok(keys(mon.daily({ maxOverdueDays: 30 })).includes(k), "Monday");
  mon.markDone({ email: call.email, step: call.step, outcome: "voicemail" });
  assert.ok(!keys(mon.daily({})).includes(k), "a voicemail ends the step");
  assert.deepEqual(mon.markDone({ email: call.email, step: call.step, undo: true }), { ok: true, done: false, changed: true, outcome: null, tries: 1, retry_on: "2026-11-02" });
  assert.ok(keys(mon.daily({})).includes(k), "undoing the voicemail leaves the Friday no-answer standing");
});

test("outcomes are checked: only calls take one, and only from the list", () => {
  const a = at(mkdtempSync(join(tmpdir(), "sa-call-")), "2026-10-28");
  a.daily({ tasks });
  assert.match(a.markDone({ email: li.email, step: li.step, outcome: "no_answer" }).error, /call step/);
  assert.match(a.markDone({ email: call.email, step: call.step, outcome: "busy" }).error, /outcome must be/);
  assert.equal(a.state.done.length, 0);
  assert.equal(a.markDone({ email: li.email, step: li.step }).outcome, "done", "Done still works for LinkedIn");
});

test("call prep lists every try and opens from the last outcome", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-call-"));
  at(dir, "2026-10-28").daily({ tasks, maxOverdueDays: 30 });
  at(dir, "2026-10-28").markDone({ email: call.email, step: call.step, outcome: "no_answer" });
  const p1 = at(dir, "2026-10-29").prep(call.email);
  assert.deepEqual(p1.calls, [{ date: "2026-10-28", step: String(call.step), outcome: "no_answer" }]);
  assert.match(p1.brief, /## Calls so far[\s\S]*2026-10-28 \(step 3\): no answer/);
  assert.ok(p1.agenda.some((x) => /1 call rang out \(last 2026-10-28\)/.test(x)));
  at(dir, "2026-10-29").markDone({ email: call.email, step: call.step, outcome: "voicemail" });
  const p2 = at(dir, "2026-10-30").prep(call.email);
  assert.equal(p2.calls.length, 2);
  assert.ok(p2.agenda.some((x) => /left a voicemail on 2026-10-29/.test(x)));
  assert.equal(p2.found, true);
  // The other person's prep shows none of Dana's calls.
  assert.equal(at(dir, "2026-10-30").prep("omar@harbor.example").calls.length, 0);
  // runPrep on its own: a stop still wins, with no agenda at all.
  const stopped = runPrep({ email: call.email, suppression: call.email, calls: p2.calls, today: "2026-10-30" });
  assert.ok(stopped.stop);
  assert.deepEqual(stopped.agenda, []);
});

test("runDaily reads retry lines from text too, and a stale retry is still too old", () => {
  const d = runDaily({ tasks, retry: `${call.email}|${call.step}|2026-11-02|2`, today: "2026-11-02", maxOverdueDays: 30 });
  const q = d.queue.find((x) => x.email === call.email && x.channel === "call" && String(x.step) === String(call.step));
  assert.equal(q.tries, 2);
  assert.equal(q.date, "2026-11-02");
  const late = runDaily({ tasks, retry: [{ email: call.email, step: call.step, on: "2026-11-02", tries: 1 }], today: "2026-11-20" });
  assert.ok(late.stale.some((x) => x.email === call.email && String(x.step) === String(call.step) && /planned 2026-11-02/.test(x.reason)));
  // A bad date in a retry row is ignored rather than moving the call.
  const bad = runDaily({ tasks, retry: [{ email: call.email, step: call.step, on: "soon" }], today: "2026-10-28" });
  assert.ok(bad.queue.some((x) => x.email === call.email && x.channel === "call" && x.tries === undefined));
});
