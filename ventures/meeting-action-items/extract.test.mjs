import test from "node:test";
import assert from "node:assert/strict";
import { extract, findDue, actionsCsv, actionsMarkdown, followUpEmail, actionsIcs, parseIso, SAMPLE } from "./extract.mjs";

const MON = parseIso("2026-10-19"); // a Monday
const run = (t, o = {}) => extract(t, { date: "2026-10-19", attendees: ["Ana", "Ben", "Cleo", "Dev"], ...o });

test("relative dates resolve from the meeting date, never to the meeting day itself for a weekday", () => {
  const d = (s, ref = MON) => { const r = findDue(s, ref); return r && new Date(r.ms).toISOString().slice(0, 10); };
  assert.equal(d("by Friday"), "2026-10-23");
  assert.equal(d("by Monday"), "2026-10-26");
  assert.equal(d("by EOD Thursday"), "2026-10-22");
  assert.equal(d("Friday EOD"), "2026-10-23");
  assert.equal(d("for the 28th"), "2026-10-28");
  assert.equal(d("tomorrow"), "2026-10-20");
  assert.equal(d("EOD"), "2026-10-19");
  assert.equal(d("next Friday"), "2026-10-30");
  assert.equal(d("this Wednesday"), "2026-10-21");
  assert.equal(d("next week"), "2026-10-30");
  assert.equal(d("end of the week"), "2026-10-23");
  assert.equal(d("end of month"), "2026-10-31");
  assert.equal(d("in 2 weeks"), "2026-11-02");
  assert.equal(d("Nov 3"), "2026-11-03");
  assert.equal(d("11/3"), "2026-11-03");
  assert.equal(d("Jan 5"), "2027-01-05");
  assert.equal(d("2026-12-01"), "2026-12-01");
  assert.equal(d("no date here"), null);
  assert.equal(d("2/30"), null);
});

test("the worked sample yields the owners, dates, decision and question we expect", () => {
  const r = run(SAMPLE);
  const rows = r.actions.map((a) => [a.owner, a.task, a.due]);
  assert.deepEqual(rows, [
    ["Ben", "Fix the Safari toggle", "2026-10-21"],
    ["Dev", "Send the churn numbers to finance", "2026-10-20"],
    ["Ana", "Draft the launch email", "2026-11-03"],
    [null, "Update the onboarding checklist before the webinar", null],
    ["Cleo", "Book the venue for the offsite", "2026-10-30"],
    ["Ben", "Look at the docs sidebar if there's time", null],
    ["Dev", "Follow up with legal on the data processing addendum", "2026-11-02"],
  ]);
  assert.deepEqual(r.decisions.map((d) => d.text), ["Keep the free tier through December"]);
  assert.deepEqual(r.questions.map((q) => q.text), ["Who owns the refund policy wording?"]);
  assert.equal(r.counts.unowned, 1);
});

test("hedged commitments are marked down, unassigned ones are low", () => {
  const r = run(SAMPLE);
  assert.equal(r.actions.find((a) => a.owner === "Ben" && /docs sidebar/.test(a.task)).confidence, "medium");
  assert.equal(r.actions.find((a) => !a.owner).confidence, "low");
});

test("it does not invent: statements, past tense and 'will be' are not actions", () => {
  const r = run("Ana: The launch went well. Ben sent the deck last week. Friday will be busy. It will be fine. Revenue is up.");
  assert.equal(r.actions.length, 0);
});

test("'I'll' with no speaker is flagged, not attributed", () => {
  const r = run("I'll send the contract tomorrow.");
  assert.equal(r.actions[0].owner, null);
  assert.match(r.actions[0].note, /add an owner/);
});

test("without a meeting date, relative dates stay as written and are flagged", () => {
  const r = extract("Ben: I'll fix the toggle by Friday.");
  assert.equal(r.actions[0].due, null);
  assert.match(r.actions[0].dueText, /Friday/);
  assert.match(r.actions[0].note, /set the meeting date/);
});

test("markers, checkboxes, @mentions and owner tags", () => {
  const r = run("ACTION: Send invoices - Cleo\nTODO: @ben renew the domain by Nov 1\n- [ ] Ana book travel\nAction item: update the FAQ (owner: Dev)");
  assert.deepEqual(r.actions.map((a) => [a.owner, a.task]), [
    ["Cleo", "Send invoices"], ["Ben", "Renew the domain"], ["Ana", "Book travel"], ["Dev", "Update the FAQ"],
  ]);
  assert.equal(r.actions[1].due, "2026-11-01");
});

test("timestamps and bullets are stripped; duplicates collapse", () => {
  const r = run("[00:12:03] Ben: I'll fix the toggle.\n- Ben: I'll fix the toggle.");
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].owner, "Ben");
});

test("a request to a named person and their later 'I will check it' make one action with the date", () => {
  const r = run("Sarah: John, can you check the vendor contract by EOD Thursday?\nJohn: Yes, I will check it.");
  assert.deepEqual(r.actions.map((a) => [a.owner, a.task, a.due, a.confidence]), [["John", "Check the vendor contract", "2026-10-22", "high"]]);
});

test("bad input is an error, not a crash", () => {
  assert.equal(extract("").ok, false);
  assert.equal(extract("x", { date: "19/10/2026" }).ok, false);
});

test("exports are well formed", () => {
  const r = run(SAMPLE);
  const csv = actionsCsv(r).trim().split("\n");
  assert.equal(csv.length, r.actions.length + 1);
  assert.equal(csv[0], "Task,Owner,Due,Confidence,Source line");
  assert.match(actionsCsv({ actions: [{ task: 'Say "hi", then go', owner: "A", due: null, confidence: "high", line: 1 }] }), /"Say ""hi"", then go"/);
  assert.match(actionsMarkdown(r), /- \[ \] Fix the Safari toggle — \*\*Ben\*\*, due 2026-10-21/);
  assert.match(actionsMarkdown(r), /needs an owner/);
  const mail = followUpEmail(r, { title: "the product sync" });
  assert.match(mail, /^Subject: Follow-up: the product sync \(2026-10-19\)/);
  assert.match(mail, /Still needs an owner/);
  const ics = actionsIcs(r);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, r.actions.filter((a) => a.due).length);
  assert.match(ics, /DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022/);
});

test("it makes no network calls", async () => {
  const src = (await import("node:fs/promises")).readFile(new URL("./extract.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(await src, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
});
