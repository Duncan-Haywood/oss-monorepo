import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, status, normAction, summaryText, overdueEmail, logCsv, templateCsv, sampleLog, SAMPLE_SETTINGS, label } from "./submittals.mjs";
import { parseDate, dayText, parseCsv } from "./colog.mjs";

const d = (s) => parseDate(s);

test("the example: counts and the chase list worked by hand", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const s = r.summary;
  // #1 closed; #2 Rev 0 superseded; #2 Rev 1 and #3 with the GC, both overdue; #4, #5, #6 not sent, #4 late.
  assert.deepEqual(
    [s.total, s.closed, s.withGc, s.overdue, s.resubmit, s.notSubmitted, s.lateToSubmit, s.deliveryAtRisk, s.superseded],
    [6, 1, 2, 2, 0, 3, 1, 2, 1],
  );
  const by = (n, rev = 0) => r.items.find((x) => x.number === n && x.revision === rev);
  // #4: needed 12-01, lead 7, review 10 -> send by 11-14; today 11-20 -> sent today, back 11-30, on site 12-07.
  assert.equal(dayText(by("4").submitBy), "2026-11-14");
  assert.equal(by("4").deliveryAtRisk, true);
  // #2 Rev 1: due back 11-17, still out -> back today 11-20, +35 = 12-25 after 12-20.
  assert.equal(by("2", 1).daysOverdue, 3);
  assert.equal(by("2", 1).deliveryAtRisk, true);
  // #3: due back 11-10, back today, +56 = 2027-01-15, exactly the needed date: not at risk.
  assert.equal(by("3").daysOverdue, 10);
  assert.equal(by("3").deliveryAtRisk, false);
  // #5: send by 2027-02-01 - 35 = 2026-12-28; back 2027-01-11 + 21 = 2027-02-01: on time.
  assert.equal(dayText(by("5").submitBy), "2026-12-28");
  assert.equal(by("5").deliveryAtRisk, false);
  assert.equal(by("2", 0).state, "superseded");
  // Delivery at risk first (most days late among them), then the rest.
  assert.deepEqual(r.chase.map((c) => `${c.number}/${c.revision}/${c.reason}/${c.days}`), ["4/0/late_to_send/6", "2/1/overdue_back/3", "3/0/overdue_back/10"]);
  assert.match(r.findings[0].text, /^26 05 33 #4 Raceway and boxes product data: not sent, last day to send was 2026-11-14, 6 days ago\. Delivery on site is at risk\.$/);
  assert.ok(r.findings.some((f) => /1 open submittal has no needed-on-site date or lead time/.test(f.text)));
  assert.match(summaryText(r), /^6 submittals, 1 closed, 2 with the GC \(2 overdue\), 0 to resubmit, 3 not sent \(1 late to send\)\. 2 put a needed-on-site date at risk\. 1 earlier revision kept on the log, not counted\.$/);
});

test("the overdue email lists only what is overdue back, with its dates", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const e = overdueEmail(r, { gc: "Harbor Builders", pm: "Maria Hill", project: "Clinic TI", sub: "Spark Electric" });
  assert.match(e, /^Subject: Clinic TI: submittals past their review date/);
  assert.match(e, /Hi Maria,/);
  assert.match(e, /26 51 00 #2 Rev 1 {2}Light fixtures product data: sent 2026-11-10, due back 2026-11-17; needed on site 2026-12-20 with a 35-day lead time after approval/);
  assert.match(e, /26 24 13 #3 {2}Switchboard shop drawings/);
  assert.doesNotMatch(e, /Raceway/);
  assert.doesNotMatch(e, /notice of delay|claim|entitle/i);
  assert.equal(overdueEmail(compute(templateCsv(), SAMPLE_SETTINGS)), "");
});

test("the CSV keeps every row, adds the worked columns and is formula-safe", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const rows = parseCsv(logCsv(r));
  assert.equal(rows.length, 8);
  assert.equal(rows[0].length, 17);
  assert.deepEqual(rows[5].slice(12), ["2026-11-14", "Not submitted", "", "", "Yes"]);
  const evil = compute("Title,Spec section\n=HYPERLINK(\"x\"),+1", SAMPLE_SETTINGS);
  assert.doesNotMatch(logCsv(evil), /(^|,)[=+@-]/m);
});

test("refuses what PayApps refuses, with the row", () => {
  const bad = (row, re) => {
    const r = compute(`Title,Sent,Required back,Returned,Action,Lead time (days),Revision\n${row}`, SAMPLE_SETTINGS);
    assert.match(r.errors.join(" "), re, row);
  };
  bad("X,,,2026-11-01,Approved,,", /Row 2: enter the date it was sent before the date it came back/);
  bad("X,2026-11-05,,2026-11-01,Approved,,", /came back is before the date it was sent/);
  bad("X,2026-11-05,2026-11-01,,,,", /required-back date is before the date it was sent/);
  bad("X,2026-11-05,,,Approved,,", /enter the date it came back with the GC's action/);
  bad("X,2026-11-05,,2026-11-09,,,", /pick the GC's action/);
  bad("X,2026-11-05,,2026-11-09,Looks fine,,", /"Looks fine" is not a GC action/);
  bad("X,,,,,731,", /not a number of days from 0 to 730/);
  bad("X,13/40/2026,,,,,", /is not a date/);
  bad("X,,,,,,B", /revision "B" is not a whole number/);
  assert.match(compute("Number,Spec\n1,2", SAMPLE_SETTINGS).errors[0], /header row with a "Title"/);
  assert.match(compute(sampleLog(), {}).errors[0], /as-of date/);
});

test("stamp wordings read to PayApps' five actions", () => {
  assert.equal(normAction("No Exceptions Taken"), "approved");
  assert.equal(normAction("Make corrections noted"), "approved_as_noted");
  assert.equal(normAction("R&R"), "revise_resubmit");
  assert.equal(normAction("Not approved"), "rejected");
  assert.equal(normAction("Received for record."), "for_record");
  assert.equal(normAction(""), null);
  assert.equal(normAction("maybe"), undefined);
});

test("rows without numbers are numbered after the highest; label matches PayApps'", () => {
  const r = compute("Number,Title\n7,A\n,B\n,C", SAMPLE_SETTINGS);
  assert.deepEqual(r.items.map((x) => x.number), ["7", "8", "9"]);
  assert.equal(label({ spec: "03 30 00", number: "7", revision: 1 }), "03 30 00 #7 Rev 1");
  assert.equal(label({ spec: "", number: "7", revision: 0 }), "#7");
  assert.equal(parse(templateCsv()).items.length, 1);
});

// The page's rules are PayApps' rules: random submittals through both must agree.
test("status agrees with PayApps' submittalStatus on 3,000 random submittals", async () => {
  const pa = await import("../payapps/apps/payapps/src/shared/submittals.ts");
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const base = d("2026-10-01");
  const maybe = (f) => (rnd(3) === 0 ? null : f());
  const actions = [null, "approved", "approved_as_noted", "revise_resubmit", "rejected", "for_record"];
  for (let i = 0; i < 3000; i++) {
    const sent = maybe(() => base + rnd(60));
    const returned = sent != null && rnd(2) ? sent + rnd(30) : null;
    const action = returned != null ? actions[1 + rnd(5)] : null;
    const s = { sent, returned, action, requiredBy: maybe(() => (sent ?? base) + rnd(30)), needed: maybe(() => base + rnd(150)), lead: maybe(() => rnd(90)), review: maybe(() => rnd(30)) };
    const today = base + rnd(120);
    const superseded = rnd(10) === 0;
    const iso = (n) => (n == null ? null : dayText(n));
    const theirs = pa.submittalStatus({ number: 1, revision: 0, specSection: null, title: "x", type: "other", submittedOn: iso(s.sent), requiredBy: iso(s.requiredBy), returnedOn: iso(s.returned), action: s.action, neededOnSite: iso(s.needed), leadTimeDays: s.lead, reviewDays: s.review }, iso(today), superseded);
    const ours = status(s, today, superseded);
    assert.deepEqual({ ...ours, submitBy: iso(ours.submitBy) }, theirs, JSON.stringify({ s, today, superseded }));
  }
});
