import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, toCsv } from "../sales-cadence-builder/calc.mjs";
import { readFileSync } from "node:fs";
import { runDaily, runMorning, csvQueue, csvLeftOut } from "./daily.mjs";

// Real cadence builder output is the interface (ROADMAP design rule 4), not a hand-built fixture.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US
Lena,Ng,lena@ridge.example,Ridge Supply,206-555-0103,WA,US
Paul,Ortiz,paul@summit.example,Summit Parts,512-555-0104,TX,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const tasks = toCsv(plan.tasks);
const firstDay = plan.tasks[0].date;

test("day one: everyone's first touch is due, nothing is left out", () => {
  const d = runDaily({ tasks, prospects: "", today: firstDay });
  assert.ok(d.queue.length >= 4);
  assert.equal(d.dropped.length, 0);
  assert.ok(d.queue.every((q) => q.date === firstDay && !q.overdue));
  assert.ok(d.later > 0, "later touches are counted, not listed");
});

test("an unsubscribe, a bounce, a pause and a suppressed domain each change what is due", () => {
  const prospects = `email,status,paused_until
dana@brightline.example,unsubscribed,
omar@harbor.example,bounced,
lena@ridge.example,paused,2027-01-01
paul@summit.example,active,`;
  const d = runDaily({ tasks, prospects, today: "2026-11-30", maxOverdueDays: 90, suppression: "" });
  const who = (list) => new Set(list.map((x) => x.email));
  assert.ok(who(d.dropped).has("dana@brightline.example"), "unsubscribed is dropped on every channel");
  assert.ok(d.dropped.some((x) => x.email === "omar@harbor.example" && x.channel === "email"));
  assert.ok(plan.tasks.some((t) => t.email === "omar@harbor.example" && t.channel !== "email"));
  assert.ok(d.queue.some((x) => x.email === "omar@harbor.example" && x.channel !== "email"), "a bounce stops email only");
  assert.ok(!d.queue.some((x) => x.email === "omar@harbor.example" && x.channel === "email"));
  assert.ok(who(d.held).has("lena@ridge.example") && !who(d.queue).has("lena@ridge.example"));
  assert.ok(d.held.every((x) => x.email !== "lena@ridge.example" || /paused until 2027-01-01/.test(x.reason)));
  const s = runDaily({ tasks, prospects, today: "2026-11-30", maxOverdueDays: 90, suppression: "@summit.example" });
  assert.ok(!s.queue.some((x) => x.email === "paul@summit.example"));
  assert.ok(s.dropped.some((x) => x.email === "paul@summit.example" && /domain/.test(x.reason)));
});

test("a pause that has expired resumes; a pause with no date waits for a person", () => {
  const exp = runDaily({ tasks, prospects: "email,status,paused_until\nlena@ridge.example,paused,2026-10-01", today: firstDay });
  assert.ok(exp.queue.some((x) => x.email === "lena@ridge.example"));
  const open = runDaily({ tasks, prospects: "email,status,paused_until\nlena@ridge.example,paused,", today: firstDay });
  assert.ok(open.held.some((x) => x.email === "lena@ridge.example" && /answer/.test(x.reason)));
});

test("overdue touches are flagged, very old ones are not queued, done ones disappear", () => {
  const day = plan.tasks.find((t) => t.date > firstDay).date;
  const all = runDaily({ tasks, prospects: "", today: day });
  const late = runDaily({ tasks, prospects: "", today: "2026-12-30" });
  assert.equal(late.queue.length, 0);
  assert.ok(late.stale.length > 0);
  const t0 = plan.tasks[0];
  const some = runDaily({ tasks, prospects: "", today: firstDay, done: `${t0.email},${t0.step}` });
  assert.equal(some.summary.alreadyDone, 1);
  assert.ok(all.queue.length > 0);
  const yesterdayTouch = runDaily({ tasks, prospects: "", today: day });
  assert.ok(yesterdayTouch.queue.some((q) => q.overdue), "first-day touches still unsent show as overdue");
});

test("touches with issues are held, and the email cap defers the rest", () => {
  const bad = [{ date: "2026-10-26", channel: "email", step: "1", prospect: "A", email: "a@x.example", issues: "[missing_field] placeholder", body: "x" }];
  assert.match(runDaily({ tasks: bad, prospects: "", today: "2026-10-26" }).held[0].reason, /fix before use/);
  const many = Array.from({ length: 5 }, (_, i) => ({ date: "2026-10-26", channel: "email", step: "1", email: `p${i}@x.example`, body: "x" }));
  const c = runDaily({ tasks: many, prospects: "", today: "2026-10-26", emailCap: 3 });
  assert.equal(c.queue.length, 3);
  assert.equal(c.held.length, 2);
});

test("morning: a reply read today removes that person from today's queue", () => {
  const replies = `From: Dana Reyes <dana@brightline.example>\nSubject: Re: route planning\n\nPlease remove me from your list.`;
  const m = runMorning({ replies, tasks, prospects: "email,status\ndana@brightline.example,active", today: firstDay });
  assert.equal(m.inbox.suppression.length, 1);
  assert.ok(!m.daily.queue.some((q) => q.email === "dana@brightline.example"));
  assert.ok(m.daily.dropped.some((q) => q.email === "dana@brightline.example"));
  assert.match(m.daily.brief, /Nothing has been sent/);
  assert.match(csvQueue(m.daily), /^date,overdue,channel/);
  assert.match(csvLeftOut(m.daily), /dropped/);
});

test("there is still no send path", () => {
  assert.doesNotMatch(readFileSync(new URL("./daily.mjs", import.meta.url), "utf8"), /\bfetch\(|nodemailer|sendmail|smtp|XMLHttpRequest/i);
});
