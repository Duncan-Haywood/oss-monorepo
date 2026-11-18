import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { callLog, addCall, callMarks, runDaily } from "./daily.mjs";
import { buildPlan, toCsv } from "../sales-cadence-builder/calc.mjs";

// The static page's Today's queue had no call outcomes: a rep without the self-host server or the CLI could not record
// a call that rang out. The page now keeps a calls box (filled by Spoke / Voicemail / No answer buttons) and a days-off
// box, read by the same callMarks and runDaily the server and the CLI use. Real Sales Cadence Builder plan: Dana's
// day-3 call is Wednesday 2026-10-28, her step-4 email Friday 2026-10-30.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const tasks = toCsv(buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" }).tasks);
const DANA = "dana@brightline.example";

test("addCall builds the calls file the CLI reads; a same-day second no-answer is not a try", () => {
  let t = addCall("", { email: "Dana@Brightline.example", step: "3", outcome: "no_answer", date: "2026-10-28" });
  assert.equal(t, "email,step,outcome,date\ndana@brightline.example,3,no_answer,2026-10-28\n");
  assert.equal(addCall(t, { email: DANA, step: "3", outcome: "no_answer", date: "2026-10-28" }), t, "a double click the same day adds nothing");
  t = addCall(t, { email: DANA, step: "3", outcome: "No answer", date: "2026-10-29" });
  t = addCall(t, { email: DANA, step: "3", outcome: "spoke", date: "2026-10-29" });
  assert.deepEqual(callLog(t).map((c) => c.outcome), ["no_answer", "no_answer", "spoke"]);
  assert.match(addCall("", { email: "a@b.example", step: "step, 2", outcome: "spoke", date: "2026-10-28" }), /"step, 2"/, "a comma in a step is quoted");
  assert.throws(() => addCall("", { email: DANA, step: "3", outcome: "maybe", date: "2026-10-28" }));
  assert.throws(() => addCall("", { email: DANA, step: "3", outcome: "spoke", date: "today" }));
  const dir = mkdtempSync(join(tmpdir(), "sa-page-calls-")), out = join(dir, "o");
  writeFileSync(join(dir, "tasks.csv"), tasks); writeFileSync(join(dir, "calls.csv"), addCall("", { email: DANA, step: "3", outcome: "no_answer", date: "2026-10-28" }));
  execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--tasks", join(dir, "tasks.csv"), "--calls", join(dir, "calls.csv"), "--today", "2026-10-29", "--out", out]);
  assert.match(readFileSync(join(out, "brief.md"), "utf8"), /Dana Reyes, Brightline Logistics \(3\).*try 2/, "the page's file works on the CLI");
});

test("the page's inputs, read the page's way, re-queue the call and move the email", () => {
  const calls = addCall(addCall("", { email: DANA, step: "3", outcome: "no_answer", date: "2026-10-28" }), { email: DANA, step: "3", outcome: "no_answer", date: "2026-10-29" });
  const marks = callMarks(callLog(calls), 3, { holidays: "us" });
  const fri = runDaily({ tasks, prospects: PROSPECTS, done: [`${DANA},1`, `${DANA},2`, ...marks.done].join("\n"), retry: marks.retry, moved: marks.moved, holidays: "us", today: "2026-10-30" });
  assert.deepEqual(fri.queue.filter((q) => q.email === DANA).map((q) => q.step), ["3"], "only the third try on Friday");
});

test("the page wires the calls box, days off, buttons, storage and call prep to the shared code", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const id of ["calls", "holidays", "daily-calls"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /import \{ runDaily, csvQueue, csvLeftOut, callMarks, callLog, addCall \} from "\.\/daily\.mjs"/);
  assert.match(html, /import \{ holidayChecker \} from "\.\/holidays\.mjs"/);
  assert.match(html, /retry: marks\.retry, moved: marks\.moved, holidays/);
  assert.match(html, /\["no_answer", "No answer"\]/);
  assert.match(html, /localStorage\.setItem\(DAILY/);
  assert.match(html, /calls: callLog\(\$\("#calls"\)\.value\)\.filter/, "call prep lists the person's calls");
});
