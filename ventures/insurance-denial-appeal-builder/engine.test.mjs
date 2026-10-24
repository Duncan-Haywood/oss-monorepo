import { test } from "node:test";
import assert from "node:assert/strict";
import { readDenial, deadlines, appealLetter, providerLetter, externalReviewLetter, checklist, calendar, sampleDenial, addMonths, parseDate, REASONS, CARC, PLAN_TYPES } from "./engine.mjs";

test("the sample denial is read as a medical-necessity denial with its details", () => {
  const r = readDenial(sampleDenial());
  assert.equal(r.top, "medical_necessity");
  assert.equal(r.statedDays, 180);
  assert.equal(r.noticeDate, "2026-09-14");
  assert.equal(r.claimNumber, "20260811-0049213");
  assert.equal(r.memberId, "ZXC123456789");
  assert.equal(r.largestAmount, 2480);
  assert.equal(r.urgent, false);
});

test("reason codes outrank phrases and every mapped code names a real reason", () => {
  for (const id of Object.values(CARC)) assert.ok(REASONS[id], id);
  assert.equal(readDenial("Adjustment code CO-197 applied").top, "prior_auth");
  assert.equal(readDenial("PR 242 services not provided by network").top, "out_of_network");
  assert.equal(readDenial("Denied: CO-18 exact duplicate").top, "duplicate");
  // a code and a conflicting phrase: the code (weight 5) beats one phrase (weight 3)
  assert.equal(readDenial("CO-50. The provider is out of network.").top, "medical_necessity");
});

test("phrases alone are enough, and unreadable text gives no guess", () => {
  assert.equal(readDenial("This treatment is considered investigational.").top, "experimental");
  assert.equal(readDenial("We could not process; time limit for filing has expired").top, "timely_filing");
  assert.equal(readDenial("hello there").top, null);
  assert.equal(readDenial("").top, null);
  assert.equal(readDenial(null).top, null);
});

test("stated appeal window is read only when it is about an appeal and plausible", () => {
  assert.equal(readDenial("You may appeal this decision within 60 days.").statedDays, 60);
  assert.equal(readDenial("Within 30 days we will send your refund. Appeal rights follow.").statedDays, null);
  assert.equal(readDenial("appeal within 5 days").statedDays, null);
  assert.equal(readDenial("Please request a review within 120 calendar days").statedDays, 120);
});

test("urgent wording is detected", () => {
  assert.equal(readDenial("You may request an expedited appeal").urgent, true);
});

test("commercial deadline is 180 days from receipt and the status follows today's date", () => {
  const d = deadlines({ plan: "commercial", received: "2026-09-14", today: "2026-10-02" });
  assert.equal(d.appealBy, "2027-03-13");
  assert.equal(d.daysLeft, 162);
  assert.equal(d.status, "open");
  assert.equal(d.externalBy, "four months after the final internal denial");
  assert.match(d.decideWithin, /60 days/);
});

test("a window closing within two weeks and a passed window are labelled, and the passed one explains the way out", () => {
  const c = deadlines({ plan: "medicare_advantage", received: "2026-08-10", today: "2026-10-02" });
  assert.equal(c.appealBy, "2026-10-09");
  assert.equal(c.status, "closing");
  const p = deadlines({ plan: "medicare_original", received: "2026-01-01", today: "2026-10-02" });
  assert.equal(p.appealBy, "2026-05-01");
  assert.equal(p.status, "passed");
  assert.match(p.notes.join(" "), /ask for an exception/);
});

test("a number stated in the notice beats the plan-type rule", () => {
  const d = deadlines({ plan: "commercial", received: "2026-09-01", today: "2026-09-02", statedDays: 90 });
  assert.equal(d.appealBy, "2026-11-30");
  assert.match(d.basis, /as stated in the notice/);
});

test("plans with no fixed rule give no date and say what to do", () => {
  for (const plan of ["medicaid", "other"]) {
    const d = deadlines({ plan, received: "2026-09-01", today: "2026-09-02" });
    assert.equal(d.appealBy, null);
    assert.equal(d.status, "unknown");
    assert.match(d.notes.join(" "), /Days stated in the notice/);
  }
  assert.equal(deadlines({ plan: "medicaid", received: "2026-09-01", today: "2026-09-02", statedDays: 90 }).appealBy, "2026-11-30");
});

test("urgent appeals use the urgent decision time and bad dates are rejected", () => {
  assert.match(deadlines({ plan: "commercial", received: "2026-09-01", today: "2026-09-02", urgent: true }).decideWithin, /72 hours/);
  assert.match(deadlines({ plan: "commercial", received: "2026-09-01", today: "2026-09-02", preService: true }).decideWithin, /30 days/);
  assert.ok(deadlines({ plan: "commercial", received: "09/01/2026", today: "2026-09-02" }).error);
  assert.ok(deadlines({ plan: "commercial", received: "2026-02-30", today: "2026-09-02" }).error);
  assert.ok(deadlines({ plan: "commercial", received: "2026-09-01", today: "nope" }).error);
});

test("date helpers handle month ends and leap days", () => {
  assert.equal(addMonths(parseDate("2026-10-31"), 4).toISOString().slice(0, 10), "2027-02-28");
  assert.equal(addMonths(parseDate("2027-10-31"), 4).toISOString().slice(0, 10), "2028-02-29");
});

test("every reason carries asks, evidence, an argument and a first step", () => {
  for (const [id, r] of Object.entries(REASONS)) {
    assert.ok(r.label && r.firstStep && r.argument, id);
    assert.ok(r.asks.length >= 2 && r.evidence.length >= 2, id);
  }
  for (const [id, p] of Object.entries(PLAN_TYPES)) assert.ok(p.label && p.next, id);
});

test("the letter names the claim, states only what it was given and asks for the file", () => {
  const letter = appealLetter({ plan: "commercial", reason: "medical_necessity", patient: "Alex Rivera", insurer: "Acme Health Plan", memberId: "ZXC1", claimNumber: "C-1", serviceDate: "2026-08-11", received: "2026-09-14", amount: 2480, date: "2026-10-02", why: "Pain for six weeks." });
  assert.match(letter, /Alex Rivera/);
  assert.match(letter, /Claim number: C-1/);
  assert.match(letter, /Amount denied: \$2,480\.00/);
  assert.match(letter, /Pain for six weeks\./);
  assert.match(letter, /clinical criteria/);
  assert.match(letter, /independent external review/);
  assert.doesNotMatch(letter, /undefined|NaN/);
});

test("missing fields become visible placeholders, never blanks or invented facts", () => {
  const letter = appealLetter({ plan: "commercial", reason: "other" });
  for (const hint of ["[your name]", "[insurer name]", "[member ID]", "[claim number]", "[date of service]", "[date received]", "[phone]"]) assert.ok(letter.includes(hint), hint);
});

test("plan-specific language, urgent request and late-appeal request appear only when they apply", () => {
  const base = { reason: "prior_auth", patient: "A" };
  assert.match(appealLetter({ ...base, plan: "medicare_original" }), /CMS-20027/);
  assert.match(appealLetter({ ...base, plan: "medicare_advantage" }), /reconsideration/);
  assert.match(appealLetter({ ...base, plan: "medicaid" }), /fair hearing/);
  assert.doesNotMatch(appealLetter({ ...base, plan: "commercial" }), /CMS-20027|fair hearing/);
  assert.doesNotMatch(appealLetter({ ...base, plan: "commercial" }), /expedited decision|past the stated deadline/);
  assert.match(appealLetter({ ...base, plan: "commercial", urgent: true }), /expedited decision/);
  const late = appealLetter({ ...base, plan: "commercial", late: true, lateReason: "I was in the hospital" });
  assert.match(late, /past the stated deadline/);
  assert.match(late, /I was in the hospital/);
});

test("the checklist leads with the notice date and the reason's first step and adds an urgent step", () => {
  const c = checklist("coding_error");
  assert.match(c[0].step, /deadline printed on it/);
  assert.equal(c[1].step, REASONS.coding_error.firstStep);
  assert.ok(!checklist("coding_error").some((i) => /jeopardize/.test(i.step)));
  assert.ok(checklist("coding_error", { urgent: true }).some((i) => /jeopardize/.test(i.step)));
});

test("the calendar file is valid iCalendar with three dated events and CRLF line ends", () => {
  const d = deadlines({ plan: "commercial", received: "2026-09-14", today: "2026-10-02" });
  const ics = calendar(d, { claim: "C-1", stamp: "20261002T000000Z" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /DTSTART;VALUE=DATE:20270313/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270227/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270306/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/);
  assert.equal(calendar(deadlines({ plan: "medicaid", received: "2026-09-14", today: "2026-10-02" })), null);
});

test("bundling, coverage-ended and surprise-bill denials are recognised by code and by phrase", () => {
  assert.equal(readDenial("Adjustment CO-97: benefit included in the allowance for another service").top, "bundled");
  assert.equal(readDenial("The claim was downcoded to a lower level of service").top, "bundled");
  assert.equal(readDenial("CO-27 expenses incurred after coverage terminated").top, "eligibility");
  assert.equal(readDenial("Your coverage was terminated on 2026-03-31.").top, "eligibility");
  assert.equal(readDenial("Emergency room visit; the anesthesiologist was out of network. Balance billing applies.").top, "surprise_bill");
  assert.match(appealLetter({ plan: "commercial", reason: "surprise_bill" }), /in-network cost sharing/);
});

test("provider letter leaves clinical facts as placeholders and asks for peer-to-peer", () => {
  const l = providerLetter({ reason: "medical_necessity", patient: "Alex Rivera", provider: "Lee", insurer: "Acme", urgent: true });
  assert.match(l, /peer-to-peer/);
  assert.match(l, /\[diagnosis, ICD-10 code\(s\)\]/);
  assert.match(l, /EXPEDITED/);
  assert.match(l, /clinician must review and sign/);
  assert.doesNotMatch(providerLetter({ reason: "duplicate" }), /EXPEDITED/);
});

test("external review letter carries the internal appeal dates or placeholders", () => {
  const l = externalReviewLetter({ reason: "experimental", patient: "Alex Rivera", appealDate: "2026-10-01", finalDenialDate: "2026-11-02" });
  assert.match(l, /dated 2026-11-02/);
  assert.match(l, /filed an internal appeal on 2026-10-01/);
  assert.match(l, /four months/);
  assert.match(externalReviewLetter({ reason: "other" }), /\[date of the final internal denial\]/);
});
