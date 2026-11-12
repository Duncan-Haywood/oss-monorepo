import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent } from "./agent.mjs";
import { buildPlan, toCsv } from "../../sales-cadence-builder/calc.mjs";

// The Days off field on the self-host page (added 2026-11-12): what is typed there is kept in state and wins over the
// HOLIDAYS setting, so a rep can change it without a restart. Real Sales Cadence Builder plan started Monday
// 2026-03-30: the call is on Wednesday 1 April, the day before the UK's Easter weekend (GOV.UK: Good Friday 3 April,
// Easter Monday 6 April in England and Wales; Scotland has no Easter Monday). No mail server.
const PROSPECTS = `first_name,last_name,email,company,phone,country,timezone
Fiona,Reid,fiona@northdock.example,North Dock Freight,+44 131 496 0000,GB,Europe/London`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-03-30", sellerTz: "Europe/London" });
const tasks = toCsv(plan.tasks);
const call = plan.tasks.find((t) => t.channel === "call");
const TOKEN = "x".repeat(16);
const at = (dir, day, env = {}) => createAgent({ ADMIN_TOKEN: TOKEN, SENT_BOX: "off", DATA_DIR: dir, ...env }, { now: () => Date.parse(day + "T12:00:00Z") });

// Two misses (Wednesday, Thursday): where does the third try land?
function thirdTry(holidays, env) {
  const dir = mkdtempSync(join(tmpdir(), "sa-off-"));
  at(dir, "2026-04-01", env).daily({ tasks, holidays, maxOverdueDays: 30 });
  at(dir, "2026-04-01", env).markDone({ email: call.email, step: call.step, outcome: "no_answer" });
  return { dir, retry: at(dir, "2026-04-02", env).markDone({ email: call.email, step: call.step, outcome: "no_answer" }).retry_on };
}

test("plan facts", () => assert.equal(call.date, "2026-04-01"));

test("the typed days off move a Thursday miss past the UK Easter weekend, per division", () => {
  assert.equal(thirdTry(undefined).retry, "2026-04-03", "no days off: Good Friday");
  assert.equal(thirdTry("gb-eng").retry, "2026-04-07", "England and Wales: past Good Friday and Easter Monday");
  assert.equal(thirdTry("gb-sct").retry, "2026-04-06", "Scotland works Easter Monday");
  assert.equal(thirdTry("gb-eng", { HOLIDAYS: "us" }).retry, "2026-04-07", "the page wins over HOLIDAYS");
  assert.equal(thirdTry(undefined, { HOLIDAYS: "gb-nir" }).retry, "2026-04-07", "HOLIDAYS still applies when nothing is typed");
  assert.equal(thirdTry("", { HOLIDAYS: "gb-eng" }).retry, "2026-04-03", "an emptied field means no days off");
  const { dir } = thirdTry("gb-sct");
  const tue = at(dir, "2026-04-06").daily({ maxOverdueDays: 30 });
  assert.equal(tue.holidays, "gb-sct", "kept across a restart");
  assert.ok(tue.queue.some((q) => q.channel === "call" && q.tries === 2), "the third try is on Monday's queue in Scotland");
  assert.match(readFileSync(join(dir, "audit.jsonl"), "utf8"), /"event":"days_off","holidays":"gb-sct"/);
});

test("over HTTP: the page shows the field, a mistyped value is refused and nothing is kept", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sa-off-http-"));
  const a = at(dir, "2026-04-01", { HOLIDAYS: "us-business" });
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  t.after(() => a.server.close());
  const base = `http://127.0.0.1:${a.server.address().port}`, H = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const page = await (await fetch(`${base}/?token=${TOKEN}`)).text();
  assert.match(page, /<input id="dq-holidays"[^>]*value="us-business"/, "prefilled from HOLIDAYS");
  assert.match(page, /gb-sct/);
  assert.match(page, /<p id="dq-off-next">Next days off: 2026-05-25 Memorial Day; 2026-07-03 Independence Day \(substitute|<p id="dq-off-next">Next days off: 2026-05-25 Memorial Day; 2026-07-03 Independence Day; 2026-09-07 Labor Day; 2026-11-26 Thanksgiving Day; 2026-12-25 Christmas Day\.<\/p>/, "the next five, named");
  const bad = await fetch(`${base}/api/daily`, { method: "POST", headers: H, body: JSON.stringify({ tasks, holidays: "gb-wales-typo" }) });
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /^Days off: "gb-wales-typo" is not a date/);
  assert.equal(a.state.holidays, null, "nothing kept from a refused value");
  const ok = await (await fetch(`${base}/api/daily`, { method: "POST", headers: H, body: JSON.stringify({ tasks, holidays: "gb-eng, 2026-04-08" }) })).json();
  assert.equal(ok.holidays, "gb-eng, 2026-04-08");
  assert.deepEqual(ok.upcomingOff.slice(0, 3), [{ date: "2026-04-03", name: "Good Friday" }, { date: "2026-04-06", name: "Easter Monday" }, { date: "2026-04-08", name: "day off" }]);
  assert.match(await (await fetch(`${base}/?token=${TOKEN}`)).text(), /value="gb-eng, 2026-04-08"/);
  const ca = await (await fetch(`${base}/api/daily`, { method: "POST", headers: H, body: JSON.stringify({ holidays: "ca" }) })).json();
  assert.deepEqual(ca.upcomingOff.map((h) => h.name).slice(0, 3), ["Good Friday", "Easter Monday", "Victoria Day"]);
});
