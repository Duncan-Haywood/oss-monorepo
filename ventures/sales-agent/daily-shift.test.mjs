import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { callMarks, runDaily, csvQueue } from "./daily.mjs";
import { buildPlan, toCsv } from "../sales-cadence-builder/calc.mjs";
import { parseCsv } from "./engine.mjs";

// A real Sales Cadence Builder plan (default cadence, start Monday 2026-10-26): step 3 is the call on Wednesday
// 10-28, step 4 the email on Friday 10-30, step 5 the call on Wednesday 11-04.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = (start) => toCsv(buildPlan(PROSPECTS, SENDER, { start, sellerTz: "America/Denver" }).tasks);
const tasks = plan("2026-10-26");
const dana = (d, step) => [...d.queue, ...d.held].find((q) => q.email === "dana@brightline.example" && String(q.step) === String(step));
const misses = (...days) => days.map((date) => ({ email: "dana@brightline.example", step: "3", outcome: "no_answer", date }));

test("the plan this test leans on: step 3 call Wed 10-28, step 4 email Fri 10-30, step 5 call Wed 11-04", () => {
  const rows = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" }).tasks.filter((t) => t.email === "dana@brightline.example");
  assert.deepEqual(rows.filter((t) => t.step >= 3 && t.step <= 5).map((t) => [t.step, t.channel, t.date]), [[3, "call", "2026-10-28"], [4, "email", "2026-10-30"], [5, "call", "2026-11-04"]]);
});

test("a third try at the step-3 call no longer shares a day with the step-4 email: later steps move back 2 business days", () => {
  const m = callMarks(misses("2026-10-28", "2026-10-29"));
  assert.deepEqual(m.retry.map((r) => r.on), ["2026-10-30"]);
  const fri = runDaily({ tasks, prospects: PROSPECTS, today: "2026-10-30", ...m });
  assert.equal(dana(fri, 3).tries, 2, "the call, try 3, is due");
  assert.equal(dana(fri, 4), undefined, "the email is not due the same day");
  const tue = runDaily({ tasks, prospects: PROSPECTS, today: "2026-11-03", ...m, done: ["dana@brightline.example|3"] });
  const s4 = dana(tue, 4);
  assert.equal(s4.date, "2026-11-03"); assert.equal(s4.planned, "2026-10-30"); assert.equal(s4.overdue, false);
  assert.deepEqual(s4.moved_by, { days: 2, step: "3" });
  assert.match(tue.brief, /Dana Reyes, Brightline Logistics \(4\) \(moved from 2026-10-30: step 3's call ran 2 business days late\)/);
  const row = parseCsv(csvQueue(tue)).find((r) => r.email === "dana@brightline.example" && r.step === "4");
  assert.equal(row.date, "2026-11-03"); assert.equal(row.planned, "2026-10-30");
  // Omar had no misses: his plan is untouched.
  assert.ok(tue.queue.every((q) => q.email !== "omar@harbor.example" || !q.moved_by));
});

test("a call that ends late after misses (voicemail on try 3) still pushes the later steps back", () => {
  const m = callMarks([...misses("2026-10-28", "2026-10-29"), { email: "dana@brightline.example", step: "3", outcome: "voicemail", date: "2026-10-30" }]);
  assert.deepEqual(m.done, ["dana@brightline.example|3"]);
  assert.deepEqual(m.moved, [{ email: "dana@brightline.example", step: "3", on: "2026-10-30" }]);
  const d = runDaily({ tasks, prospects: PROSPECTS, today: "2026-11-06", ...m });
  assert.equal(dana(d, 5).date, "2026-11-06", "step 5's call, planned 11-04, moves to 11-06");
  // Without the shift (shiftLater: false) the old plan dates stand.
  const old = runDaily({ tasks, prospects: PROSPECTS, today: "2026-11-06", ...m, shiftLater: false });
  assert.equal(dana(old, 5).date, "2026-11-04"); assert.equal(dana(old, 5).overdue, true);
});

test("holidays: a call that rings out the day before Thanksgiving comes back Friday, and the step after it skips the holiday", () => {
  const t = plan("2026-11-23"); // step 3 call Wed 11-25, step 4 email Fri 11-27 (the plan was built without days off)
  const m = callMarks(misses("2026-11-25"), 3, { holidays: "us" });
  assert.equal(m.retry[0].on, "2026-11-27", "not Thanksgiving Thursday");
  assert.equal(callMarks(misses("2026-11-25")).retry[0].on, "2026-11-26", "without a list, Thursday");
  const d = runDaily({ tasks: t, prospects: PROSPECTS, today: "2026-11-30", ...m, holidays: "us", done: ["dana@brightline.example|3"] });
  assert.equal(dana(d, 4).date, "2026-11-30"); assert.deepEqual(dana(d, 4).moved_by, { days: 1, step: "3" });
});

test("CLI: --calls moves the later steps and --holidays keeps the retry off Thanksgiving", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-shift-")), out = join(dir, "o"), cli = new URL("./cli.mjs", import.meta.url).pathname;
  writeFileSync(join(dir, "tasks.csv"), plan("2026-11-23"));
  writeFileSync(join(dir, "calls.csv"), "email,step,outcome,date\ndana@brightline.example,3,no_answer,2026-11-25\n");
  const run = (today, ...extra) => { execFileSync("node", [cli, "--tasks", join(dir, "tasks.csv"), "--calls", join(dir, "calls.csv"), "--today", today, "--out", out, ...extra]); return readFileSync(join(out, "brief.md"), "utf8"); };
  assert.match(run("2026-11-26"), /Dana Reyes, Brightline Logistics \(3\)/, "no list: back on Thursday");
  assert.doesNotMatch(run("2026-11-26", "--holidays", "us"), /Dana Reyes, Brightline Logistics \(3\)/);
  const fri = run("2026-11-27", "--holidays", "us");
  assert.match(fri, /Dana Reyes, Brightline Logistics \(3\)[^\n]*try 2/);
  assert.doesNotMatch(fri, /Dana Reyes, Brightline Logistics \(4\)/, "the step-4 email waits for Monday");
});

// Red team 2026-11-12: hand-made rows that pin the tie rules in laterShifts and the `later` count.
const row = (step, channel, date) => ({ date, channel, step: String(step), prospect: "Dana Reyes", company: "Brightline Logistics", email: "dana@brightline.example", phone: "303-555-0101", subject: channel === "email" ? `Step ${step}` : "", body: channel === "email" ? "Hi Dana" : "" });

test("two calls that slip the same number of days: the first one is named, and same-date steps run in step order", () => {
  // Steps 1 and 2 are calls, each ended one business day late; step 3 waits. A tie keeps the first slip.
  const rows = [row(1, "call", "2026-11-02"), row(2, "call", "2026-11-04"), row(3, "email", "2026-11-06")];
  const moved = [{ email: "dana@brightline.example", step: "1", on: "2026-11-03" }, { email: "dana@brightline.example", step: "2", on: "2026-11-05" }];
  const d = runDaily({ tasks: rows, prospects: PROSPECTS, today: "2026-11-09", moved, done: ["dana@brightline.example|1", "dana@brightline.example|2"] });
  assert.deepEqual(dana(d, 3).moved_by, { days: 1, step: "1" });
  assert.equal(dana(d, 3).date, "2026-11-09");
  // Step 2 sits on the same date as step 1 but comes first in the file: plan order is by step, so step 2 is after the
  // retried call and moves with it.
  const same = [row(2, "email", "2026-11-03"), row(3, "email", "2026-11-03"), row(1, "call", "2026-11-03"), row(4, "email", "2026-11-03")];
  const r = runDaily({ tasks: same, prospects: PROSPECTS, today: "2026-11-04", retry: [{ email: "dana@brightline.example", step: "1", on: "2026-11-04", tries: 1 }] });
  for (const s of [2, 3, 4]) assert.deepEqual(dana(r, s).moved_by, { days: 1, step: "1" }, `step ${s}`);
});

test("summary.later counts the touches dated after today, and nothing else", () => {
  const rows = [row(1, "email", "2026-11-02"), row(2, "email", "2026-11-03"), row(3, "email", "2026-11-04")];
  assert.equal(runDaily({ tasks: rows, prospects: PROSPECTS, today: "2026-11-02" }).summary.later, 2);
  assert.equal(runDaily({ tasks: rows, prospects: PROSPECTS, today: "2026-11-04" }).summary.later, 0);
});
