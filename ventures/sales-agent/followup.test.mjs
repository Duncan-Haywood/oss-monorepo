import { test } from "node:test";
import assert from "node:assert/strict";
import { runFollowUp } from "./followup.mjs";

const PROSPECTS = `email,first_name,company,status
dana@brightline.example,Dana,Brightline Logistics,replied
gone@x.example,Gone,X Co,unsubscribed`;
const OFFER = { sender: "Sam Ortiz", company: "Example Routing Co.", address: "100 Example St, Springfield, IL 62701", product: "Example Routing", booking_link: "" };
const NOTES = `- Plans 40 routes by hand every morning
- Wants it to read their dispatch spreadsheet
- I will send a sample route file by Friday
- Dana will check the export format with IT
- Next call Tuesday to walk through the sample`;
const run = (email, x = {}) => runFollowUp({ email, prospects: PROSPECTS, notes: NOTES, offer: OFFER, today: "2026-10-24", ...x });

test("sorts notes into recap, ours, theirs and a dated next step", () => {
  const d = run("dana@brightline.example");
  assert.equal(d.ours.length, 1);
  assert.equal(d.theirs.length, 1);
  assert.match(d.next.line, /Tuesday/);
  assert.equal(d.recap.length, 2);
  assert.equal(d.approval, "needs_approval");
  assert.match(d.draft.body, /What I will do:\n- Send a sample route file/);
  assert.match(d.draft.body, /reply "unsubscribe"/);
});

test("the number comes from the notes, so the draft passes; an invented one would not", () => {
  const d = run("dana@brightline.example");
  assert.ok(d.lint.ok, d.lint.errors.join("; "));
  const bad = run("dana@brightline.example", { notes: NOTES, offer: { ...OFFER, product: "Example Routing, guaranteed 35% savings" } });
  assert.ok(!bad.lint.ok);
  assert.match(bad.lint.errors.join(" "), /35%|guarantee/);
});

test("no draft for someone who asked to stop", () => {
  const d = run("gone@x.example");
  assert.equal(d.draft, null);
  assert.equal(d.approval, "nothing_to_send");
  assert.match(d.issues.join(" "), /Do not send/);
});

test("missing next step is flagged and the draft asks for times", () => {
  const d = run("dana@brightline.example", { notes: "- Wants a demo of exports\n- I will send pricing" });
  assert.equal(d.next, null);
  assert.match(d.issues.join(" "), /No dated next step/);
  assert.match(d.draft.body, /two or three times/);
});

test("empty notes produce no draft", () => {
  const d = run("dana@brightline.example", { notes: "" });
  assert.equal(d.draft, null);
});

test("contractions, 'said she will', imperatives and 'need to' sort to the right side", () => {
  const d = run("dana@brightline.example", { notes: "- They'll share the current route file\n- She said she will get back to us on Monday\n- Send the sample file by Friday\n- Need to send them the pricing\n- Need budget approval first" });
  assert.deepEqual(d.theirs.length, 2);
  assert.deepEqual(d.ours.length, 2);
  assert.deepEqual(d.recap, ["Need budget approval first"]);
});
