import { test } from "node:test";
import assert from "node:assert/strict";
import { check, letterKind, letterText, summaryText, deadlineFor, parseDay, isoDay, addMonths, addBusinessDays, parseMoney, dollars, STATES, STATE_CODES, SAMPLE } from "./calc.mjs";

const base = { state: "CA", deposit: "2000", moveOut: "2026-06-01", today: "2026-06-10", returned: "0", itemized: false };
const day = (s) => parseDay(s);

test("calendar-day deadlines", () => {
  assert.equal(isoDay(deadlineFor("CA", day("2026-06-01"))), "2026-06-22");
  assert.equal(isoDay(deadlineFor("NY", day("2026-06-01"))), "2026-06-15");
  assert.equal(isoDay(deadlineFor("VA", day("2026-06-01"))), "2026-07-16");
  assert.equal(isoDay(deadlineFor("OR", day("2026-01-01"))), "2026-02-01");
});

test("month and business-day deadlines", () => {
  assert.equal(isoDay(addMonths(day("2026-01-31"), 1)), "2026-02-28");
  assert.equal(isoDay(deadlineFor("CO", day("2026-03-15"))), "2026-04-15");
  // 14 business days from Mon 2026-06-01 skips two weekends: Mon 2026-06-19
  assert.equal(isoDay(addBusinessDays(day("2026-06-01"), 14)), "2026-06-19");
  assert.equal(isoDay(deadlineFor("AZ", day("2026-06-01"))), "2026-06-19");
});

test("within time, overdue and returned statuses", () => {
  assert.equal(check(base).status, "within-time");
  assert.equal(check(base).daysLeft, 12);
  assert.equal(check({ ...base, today: "2026-07-01" }).status, "overdue");
  assert.equal(check({ ...base, today: "2026-07-01" }).daysLeft, -9);
  assert.equal(check({ ...base, returned: "2000", today: "2026-07-01" }).status, "returned");
  assert.equal(check({ ...base, today: "2026-06-22" }).daysLeft, 0);
});

test("a statement and part-payment after the deadline is flagged, not called returned", () => {
  const r = check({ ...base, today: "2026-07-01", returned: "1200", itemized: true });
  assert.equal(r.status, "late-with-statement");
  assert.equal(r.withheld, 80000);
  assert.equal(letterKind(r), "dispute");
});

test("forwarding-address states do not start the clock without one", () => {
  const r = check({ ...base, state: "TX", today: "2026-09-01" });
  assert.equal(r.status, "clock-not-started");
  assert.equal(r.deadline, null);
  assert.equal(letterKind(r), "forwarding");
  const r2 = check({ ...base, state: "TX", forwardingGiven: "2026-06-10", today: "2026-09-01" });
  assert.equal(isoDay(r2.deadline), "2026-07-10");
  assert.equal(r2.status, "overdue");
});

test("Florida uses the 30-day claim-notice deadline as the hard one", () => {
  const r = check({ ...base, state: "FL", today: "2026-06-20" });
  assert.equal(isoDay(r.firstDeadline), "2026-06-16");
  assert.equal(isoDay(r.deadline), "2026-07-01");
  assert.equal(r.status, "within-time");
});

test("exposure is a multiple of the amount withheld, shown only for states with a flat multiple", () => {
  assert.equal(check({ ...base, state: "MA", today: "2026-08-01" }).exposureCents, 600000);
  assert.equal(check({ ...base, state: "NY", today: "2026-08-01" }).exposureCents, null);
  assert.equal(check({ ...base, state: "MA", today: "2026-08-01", returned: "500" }).exposureCents, 450000);
});

test("bad input is reported, not guessed at", () => {
  assert.equal(check({ ...base, state: "ZZ" }).ok, false);
  assert.equal(check({ ...base, deposit: "abc" }).ok, false);
  assert.equal(check({ ...base, moveOut: "2026-02-30" }).ok, false);
  assert.equal(check({ ...base, returned: "3000" }).ok, false);
  assert.equal(check({ ...base, forwardingGiven: "nope" }).ok, false);
});

test("letter fills in the facts and carries the statute", () => {
  const r = check(SAMPLE);
  const t = letterText(r, SAMPLE, SAMPLE.today);
  assert.match(t, /Sam Rivera/);
  assert.match(t, /\$1,800\.00/);
  assert.match(t, /Tex\. Prop\. Code/);
  assert.match(t, /Sunday, August 16, 2026|Saturday, August 15, 2026/);
  assert.match(t, /88 Elm Ave/);
  assert.equal(letterText(check(base), {}, "2026-06-10"), "");
});

test("money and table sanity", () => {
  assert.equal(parseMoney("$1,250.5"), 125050);
  assert.ok(Number.isNaN(parseMoney("-5")));
  assert.equal(dollars(5), "$0.05");
  assert.ok(STATE_CODES.length >= 15);
  for (const c of STATE_CODES) {
    const s = STATES[c];
    assert.ok(s.cite && s.penaltyText && (s.days || s.months), c);
  }
  assert.match(summaryText(check({ ...base, today: "2026-07-01" })), /Statute: Cal\. Civ\. Code § 1950\.5/);
});
