import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { callMarks, runDaily } from "./daily.mjs";
import { buildPlan, toCsv } from "../sales-cadence-builder/calc.mjs";

// The self-host page records call outcomes with buttons; a rep on the CLI keeps the same thing as a calls.csv. Both read
// marks through callMarks. Real Sales Cadence Builder plan: the day-3 call falls on Wednesday 2026-10-28.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const tasks = toCsv(buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" }).tasks);
const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("callMarks: misses retry the next business day, any other mark or three misses is done", () => {
  const m = callMarks("email,step,outcome,date\nDana@Brightline.example,3,No answer,2026-10-30\nomar@harbor.example,3,voicemail,2026-10-28\nomar@harbor.example,5,,2026-11-04\nx@y.example,3,no_answer,2026-10-27\nx@y.example,3,no_answer,2026-10-28\nx@y.example,3,no_answer,2026-10-29\n");
  assert.deepEqual(m.retry, [{ email: "dana@brightline.example", step: "3", on: "2026-11-02", tries: 1, last: "2026-10-30" }], "Friday's miss comes back Monday");
  assert.deepEqual(m.done.sort(), ["omar@harbor.example|3", "omar@harbor.example|5", "x@y.example|3"]);
  const d = runDaily({ tasks, prospects: PROSPECTS, today: "2026-11-02", ...m });
  const dana = d.queue.find((q) => q.email === "dana@brightline.example" && q.channel === "call" && q.step === "3");
  assert.equal(dana.tries, 1); assert.equal(dana.planned, "2026-10-28"); assert.equal(dana.overdue, false);
  assert.ok(!d.queue.some((q) => q.email === "omar@harbor.example" && q.step === "3"), "a voicemail ends the step");
});

test("CLI --calls: the daily brief re-queues a missed call and --prep lists that person's calls only", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-cli-calls-")), out = join(dir, "o");
  writeFileSync(join(dir, "tasks.csv"), tasks);
  writeFileSync(join(dir, "calls.csv"), "email,step,outcome,date\ndana@brightline.example,3,no_answer,2026-10-28\nomar@harbor.example,3,spoke,2026-10-28\n");
  execFileSync("node", [cli, "--tasks", join(dir, "tasks.csv"), "--calls", join(dir, "calls.csv"), "--today", "2026-10-28", "--out", out]);
  let brief = readFileSync(join(out, "brief.md"), "utf8");
  assert.doesNotMatch(brief, /Dana Reyes, Brightline Logistics \(3\)/, "not again the day it rang out");
  assert.doesNotMatch(brief, /Omar Khan, Harbor Freight Co \(3\)/, "spoke ends the step");
  execFileSync("node", [cli, "--tasks", join(dir, "tasks.csv"), "--calls", join(dir, "calls.csv"), "--today", "2026-10-29", "--out", out]);
  brief = readFileSync(join(out, "brief.md"), "utf8");
  assert.match(brief, /Dana Reyes, Brightline Logistics \(3\).*try 2: no answer once, last 2026-10-28/);
  execFileSync("node", [cli, "--tasks", join(dir, "tasks.csv"), "--today", "2026-10-29", "--out", out]);
  assert.match(readFileSync(join(out, "brief.md"), "utf8"), /Omar Khan, Harbor Freight Co \(3\)/, "without the file the call is still due");
  execFileSync("node", [cli, "--prep", "dana@brightline.example", "--calls", join(dir, "calls.csv"), "--today", "2026-10-29", "--out", out]);
  const prep = readFileSync(join(out, "call-prep.md"), "utf8");
  assert.match(prep, /## Calls so far, oldest first\n- 2026-10-28 \(step 3\): [^\n]*\n\n/, "one call, Dana's");
});
