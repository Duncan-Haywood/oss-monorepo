import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent } from "./agent.mjs";
import { buildPlan, toCsv } from "../../sales-cadence-builder/calc.mjs";

// Calls, LinkedIn touches and letters never show in mail, so the Sent folder cannot tick them off. The approval page's
// Done button marks one done; the mark is kept in state and fed to runDaily as its done input. Real cadence builder
// plan; no mail server (the daily run needs none).
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const tasks = toCsv(plan.tasks);
const call = plan.tasks.find((t) => t.email === "dana@brightline.example" && t.channel === "call");
const li = plan.tasks.find((t) => t.email === "dana@brightline.example" && t.channel === "linkedin");
const keys = (d) => d.queue.map((q) => `${q.email}|${q.channel}|${q.step}`);

const agentAt = (dir, iso) => createAgent({ ADMIN_TOKEN: "x".repeat(16), DATA_DIR: dir, SENT_BOX: "off" }, { now: () => Date.parse(iso) });

test("Done takes a call off today's queue, survives a restart, and Undo puts it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-done-"));
  const a = agentAt(dir, call.date + "T17:00:00Z");
  const before = a.daily({ tasks, maxOverdueDays: 30 });
  const k = `${call.email}|call|${call.step}`;
  assert.ok(keys(before).includes(k), "the call is due before it is marked");
  assert.deepEqual(a.markDone({ email: "Dana@Brightline.example", step: call.step }), { ok: true, done: true, changed: true });
  assert.equal(a.markDone({ email: call.email, step: call.step }).changed, false, "marking twice changes nothing");
  const after = a.daily({});
  assert.ok(!keys(after).includes(k), "gone once marked");
  assert.equal(after.summary.due, before.summary.due - 1);
  assert.equal(after.summary.alreadyDone - after.summary.alreadySent, before.summary.alreadyDone - before.summary.alreadySent + 1);
  assert.deepEqual(after.doneToday.map((x) => [x.email, x.step, x.channel]), [[call.email, String(call.step), "call"]]);
  // A restart reads the mark from state.json.
  const b = agentAt(dir, call.date + "T18:00:00Z");
  assert.ok(!keys(b.daily({})).includes(k), "still gone after a restart");
  // The next day it is no longer listed as done today, and stays off the queue.
  const c = agentAt(dir, "2026-11-04T17:00:00Z");
  const next = c.daily({ maxOverdueDays: 30 });
  assert.ok(!keys(next).includes(k));
  assert.equal(next.doneToday.length, 0);
  assert.equal(c.markDone({ email: call.email, step: call.step, undo: true }).changed, true);
  assert.ok(keys(c.daily({ maxOverdueDays: 30 })).includes(k), "Undo puts it back");
});

test("only a step in the kept task list can be marked; bad input is refused", () => {
  const a = agentAt(mkdtempSync(join(tmpdir(), "sa-done-")), li.date + "T17:00:00Z");
  assert.match(a.markDone({ email: li.email, step: li.step }).error, /no such step/, "no task list kept yet");
  a.daily({ tasks });
  assert.match(a.markDone({ email: li.email, step: "99" }).error, /no such step/);
  assert.match(a.markDone({ email: "nobody@else.example", step: li.step }).error, /no such step/);
  assert.match(a.markDone({ email: li.email }).error, /send/);
  assert.match(a.markDone({ email: "a|b@x.example", step: li.step }).error, /bad/);
  assert.equal(a.state.done.length, 0);
  assert.equal(a.markDone({ email: li.email, step: li.step }).ok, true);
  assert.equal(a.state.done[0].channel, "linkedin");
});

test("POST /api/daily/done needs the token; the page carries the Done and Undo wiring", async (t) => {
  const a = agentAt(mkdtempSync(join(tmpdir(), "sa-done-")), call.date + "T17:00:00Z");
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  t.after(() => a.server.close());
  const base = `http://127.0.0.1:${a.server.address().port}`, H = { authorization: `Bearer ${"x".repeat(16)}`, "content-type": "application/json" };
  await fetch(`${base}/api/daily`, { method: "POST", headers: H, body: JSON.stringify({ tasks, maxOverdueDays: 30 }) });
  const body = JSON.stringify({ email: call.email, step: call.step });
  assert.equal((await fetch(`${base}/api/daily/done`, { method: "POST", body })).status, 401);
  assert.equal((await fetch(`${base}/api/daily/done`, { method: "POST", headers: H, body: "{" })).status, 400);
  assert.equal((await fetch(`${base}/api/daily/done`, { method: "POST", headers: H, body: JSON.stringify({ email: call.email, step: "99" }) })).status, 422);
  const r = await fetch(`${base}/api/daily/done`, { method: "POST", headers: H, body });
  assert.equal(r.status, 200);
  const d = await (await fetch(`${base}/api/daily`, { headers: H })).json();
  assert.ok(!keys(d).includes(`${call.email}|call|${call.step}`));
  assert.equal(d.doneToday.length, 1);
  const csv = await (await fetch(`${base}/api/daily?format=queue.csv`, { headers: H })).text();
  assert.ok(!csv.split("\n").some((l) => l.includes(call.email) && l.includes(",call,")), "queue.csv agrees");
  const page = await (await fetch(`${base}/?token=${"x".repeat(16)}`)).text();
  assert.match(page, /\/api\/daily\/done/);
  assert.match(page, /id="dq-list"/);
  assert.match(page, /Press Done on a call/);
});
