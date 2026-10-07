import { test } from "node:test";
import assert from "node:assert/strict";
import { overdueFromInvoiceMaker, invoiceBalanceCents, parseDate, addDays, daysBetween, accrual, annualRatePct, buildPlan, worthSuing, verdictText, icsText, planText, sampleInputs, STATE_RATES, STEP_DEFAULTS, validate, warnings } from "./calc.mjs";

const base = () => sampleInputs("2026-09-29");

test("date helpers are calendar-day exact and reject impossible dates", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("nope"), null);
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
});

test("contract rate: 1.5 percent a month is 18 percent a year, simple interest", () => {
  const i = { ...base(), amount: 1000, dueDate: "2026-01-01", flatFee: 0 };
  assert.equal(annualRatePct(i), 18);
  const a = accrual(i, "2026-04-11"); // 100 days
  assert.equal(a.daysLate, 100);
  assert.equal(a.interest, Math.round(((1000 * 0.18 * 100) / 365) * 100) / 100);
  assert.equal(a.total, 1000 + a.interest);
});

test("flat fee and interest wait out the grace period, then run from the due date", () => {
  const i = { ...base(), amount: 1000, dueDate: "2026-01-01", graceDays: 5, flatFee: 25 };
  assert.equal(accrual(i, "2026-01-06").total, 1000);
  const after = accrual(i, "2026-01-07");
  assert.equal(after.flatFee, 25);
  assert.ok(after.interest > 0);
});

test("nothing accrues before the due date and basis none adds no interest", () => {
  const i = { ...base(), dueDate: "2026-10-05", flatFee: 0 };
  assert.equal(accrual(i, "2026-09-29").daysLate, 0);
  assert.equal(accrual(i, "2026-09-29").total, i.amount);
  assert.equal(accrual({ ...base(), basis: "none", flatFee: 0 }, "2027-01-01").interest, 0);
});

test("state basis uses the typed annual rate", () => {
  const i = { ...base(), basis: "state", annualPct: 10, amount: 3650, dueDate: "2026-01-01", flatFee: 0 };
  assert.equal(accrual(i, "2026-01-11").interest, 10);
});

test("state table only carries fixed statutory rates with a citation", () => {
  for (const [code, r] of Object.entries(STATE_RATES)) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.ok(r.pct > 0 && r.pct <= 12);
    assert.ok(r.cite.length > 4);
  }
  for (const floating of ["TX", "FL", "NJ", "OH", "GA"]) assert.equal(STATE_RATES[floating], undefined);
});

test("plan has four steps at the default offsets with dates and filled numbers", () => {
  const i = { ...base(), dueDate: "2026-09-25", today: "2026-09-25" };
  const p = buildPlan(i);
  assert.equal(p.steps.length, 4);
  assert.deepEqual(p.steps.map((s) => s.date), ["2026-09-28", "2026-10-09", "2026-10-25", "2026-11-09"]);
  assert.deepEqual(p.steps.map((s) => s.offset), STEP_DEFAULTS.map((s) => s.offset));
  assert.match(p.steps[0].body, /\$2,400\.00/);
  assert.match(p.steps[2].body, /final demand/i);
  assert.match(p.steps[3].subject, /referred for recovery/);
  assert.ok(p.steps.every((s) => s.body.includes("Alex Rivera")));
});

test("steps already past are moved to today and marked missed", () => {
  const p = buildPlan(base()); // 12 days late
  assert.equal(p.steps[0].missed, true);
  assert.equal(p.steps[0].date, "2026-09-29");
  assert.equal(p.steps[3].missed, false);
});

test("the accrual table never lists a past date and is sorted", () => {
  const p = buildPlan(base());
  const dates = p.table.map((r) => r.asOf);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(dates.every((d) => d >= "2026-09-29"));
  for (let k = 1; k < p.table.length; k++) assert.ok(p.table[k].total >= p.table[k - 1].total);
});

test("consumer letters and warnings do not threaten a business-style referral", () => {
  const i = { ...base(), clientType: "consumer" };
  const p = buildPlan(i);
  assert.match(p.steps[2].body, /consider the options open to me/);
  assert.ok(p.warnings.some((w) => /individual/.test(w)));
});

test("validation catches bad amounts and dates", () => {
  assert.ok(validate({ ...base(), amount: 0 }).length);
  assert.ok(validate({ ...base(), dueDate: "2026-13-01" }).length);
  assert.ok(buildPlan({ ...base(), amount: -5 }).errors.length);
  assert.equal(buildPlan({ ...base(), amount: -5 }).steps, undefined);
});

test("warnings flag a contract basis, a high rate and an unstored state", () => {
  assert.ok(warnings({ ...base(), contractMonthlyPct: 3 }).some((w) => /high/.test(w)));
  assert.ok(warnings({ ...base(), basis: "state", state: "TX" }).some((w) => /user-supplied|type the rate/.test(w)));
});

test("small claims: over-limit claim is capped and reported", () => {
  const w = worthSuing({ claim: 15000, limit: 10000 });
  assert.equal(w.overLimit, true);
  assert.equal(w.claim, 10000);
  assert.equal(w.excess, 5000);
  assert.match(verdictText(w), /Over the limit/);
});

test("small claims: a tiny claim is not worth filing and a large one is", () => {
  assert.equal(worthSuing({ claim: 150 }).verdict, "not");
  assert.equal(worthSuing({ claim: 5000 }).verdict, "worth");
  assert.equal(worthSuing({ claim: 0 }).verdict, "none");
});

test("small claims: break-even claim sits between a losing and a winning claim", () => {
  const be = worthSuing({ claim: 1000 }).breakEvenClaim;
  assert.ok(be > 0);
  assert.ok(worthSuing({ claim: be - 50 }).expectedNet < 0);
  assert.ok(worthSuing({ claim: be + 50 }).expectedNet > 0);
});

test("small claims: zero win chance gives no break-even and a not-worth verdict", () => {
  const w = worthSuing({ claim: 5000, winPct: 0 });
  assert.equal(w.breakEvenClaim, null);
  assert.equal(w.verdict, "not");
});

test("ics has one all-day event per step, CRLF endings, escaped text and an alarm", () => {
  const i = base();
  const p = buildPlan(i);
  const ics = icsText(i, p, "2026-09-29");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20260929/);
  assert.ok(!/[^\r]\n/.test(ics));
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75);
  const uids = [...ics.matchAll(/UID:(.*)/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, 4);
});

test("plan text carries the balance, the steps, the verdict and the state-rate caveat", () => {
  const i = { ...base(), basis: "state", state: "CA", annualPct: 10 };
  const p = buildPlan(i);
  const t = planText(i, p);
  assert.match(t, /STEP 4/);
  assert.match(t, /IS IT WORTH SUING/);
  assert.match(t, /Verify with your state statute/);
  assert.match(t, /Not legal advice/);
});

test("Invoice Maker handoff: only sent, unpaid, past-due invoices, most late first, with their own terms", () => {
  const mk = (o) => ({ id: "x", number: "1", clientName: "A", sent: true, due: "2026-09-01", taxRate: 0, lines: [{ desc: "w", qty: 1, rate: "1000" }], ...o });
  const text = JSON.stringify({ invoices: [
    mk({ id: "a", number: "10", due: "2026-09-20", paid: "250", lateFlat: "25", lateMonthlyPct: "1.5", fromName: "Me", payInstructions: "Zelle" }),
    mk({ id: "b", number: "11", due: "2026-08-01", taxRate: 10, discountType: "percent", discountValue: 10 }),
    mk({ id: "c", sent: false }), mk({ id: "d", void: true }), mk({ id: "e", paid: "1000" }), mk({ id: "f", due: "2026-10-05" }), mk({ id: "g", due: "bad" }), null,
  ] });
  const r = overdueFromInvoiceMaker(text, "2026-10-05");
  assert.deepEqual(r.map((x) => x.id), ["b", "a"]);
  assert.equal(r[0].amount, 990); // 1000 - 10% discount = 900, +10% tax = 990
  assert.equal(r[1].amount, 750);
  assert.equal(r[1].daysLate, 15);
  assert.equal(r[1].lateFlat, 25);
  assert.equal(r[1].lateMonthlyPct, 1.5);
  assert.equal(r[1].payInstructions, "Zelle");
});

test("Invoice Maker handoff: bad or missing storage is an empty list, never a throw", () => {
  for (const t of [null, "", "{", "[]", '{"invoices":5}']) assert.deepEqual(overdueFromInvoiceMaker(t, "2026-10-05"), []);
  assert.equal(invoiceBalanceCents({ lines: [], paid: "5" }), -500);
});
