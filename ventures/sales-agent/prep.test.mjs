import { test } from "node:test";
import assert from "node:assert/strict";
import { runPrep, FIELDS } from "./prep.mjs";

const PROSPECTS = `email,first_name,company,status,paused_until
dana@brightline.example,Dana,Brightline Logistics,replied,
sue@optout.example,Sue,Optout Inc,active,
gone@x.example,Gone,X Co,unsubscribed,`;
const THREAD = `From: Dana Reyes <dana@brightline.example>
Subject: Re: routing
Date: 2026-10-20

Yes, interested. We plan 40 routes by hand in spreadsheets every morning and it takes hours. Our budget is set for Q1. Can we talk next week?
---
From: Sam Ortiz <sam@example.com>
Subject: Re: routing

Great, how is Tuesday?
---
From: Sue Park <sue@optout.example>
Subject: Re: hello
Date: 2026-10-21

Please remove me from your list and stop emailing me.`;
const CRM = `First Name,Last Name,Email,Company name,Job Title,Industry,Number of Employees,Country/Region
Dana,Reyes,dana@brightline.example,Brightline Logistics,Director of Operations,Logistics,120,United States`;
const run = (e, x = {}) => runPrep({ email: e, prospects: PROSPECTS, replies: THREAD, crm: CRM, today: "2026-10-24", ...x });

test("brief pulls facts, her own words and the gaps, with a question per gap", () => {
  const d = run("dana@brightline.example");
  assert.equal(d.stop, "");
  assert.equal(d.history.length, 1, "only her messages, not ours");
  assert.equal(d.history[0].category, "interested");
  const known = Object.fromEntries(d.known.map((k) => [k.field, k]));
  assert.match(known["Pain / need"].evidence, /spreadsheets/);
  assert.equal(known["Pain / need"].source, "their reply");
  assert.match(known["Budget"].evidence, /budget is set/);
  assert.ok(d.unknown.some((u) => u.field === "Decision maker"));
  assert.equal(d.known.length + d.unknown.length, FIELDS.length);
  assert.ok(d.facts.some((f) => f.fact === "title: Director of Operations" && f.source === "CRM export"));
  assert.match(d.brief, /## Still unknown: ask/);
  assert.match(d.agenda.at(-1), /dated next step/);
});

test("notes count as evidence but rank after their own words", () => {
  const d = run("dana@brightline.example", { notes: "She currently using Excel and a vendor. Legal review takes two weeks." });
  const k = Object.fromEntries(d.known.map((x) => [x.field, x]));
  assert.equal(k["Alternatives"].source, "your call notes");
  assert.equal(k["Decision process"].source, "your call notes");
  assert.equal(k["Pain / need"].source, "their reply");
});

test("someone who asked to stop gets a warning first and no agenda", () => {
  const d = run("sue@optout.example");
  assert.match(d.stop, /asked you to stop/);
  assert.equal(d.agenda.length, 0);
  assert.match(d.brief, /^# [^\n]+\n\n\*\*Do not chase/);
});

test("status, bounce and suppression list each stop outreach", () => {
  assert.match(run("gone@x.example").stop, /unsubscribed/);
  assert.match(run("dana@brightline.example", { suppression: "@brightline.example" }).stop, /suppression/);
});

test("an unknown address says nothing is on file and invents nothing", () => {
  const d = run("nobody@nowhere.example");
  assert.equal(d.found, false);
  assert.deepEqual(d.facts, []);
  assert.equal(d.known.length, 0);
  assert.match(d.brief, /Nothing is on file/);
});
