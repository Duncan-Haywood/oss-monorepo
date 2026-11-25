import { test } from "node:test";
import assert from "node:assert/strict";
import { millerDeadlines, noticeLetter } from "./millerbond.mjs";

test("second tier: 90-day notice, suit from day 91, one-year limit (hand-counted)", () => {
  // 2026-03-02 + 90 days: March has 29 days left, April 30, May 31 = 90 -> 2026-05-31.
  const r = millerDeadlines({ tier: "second", lastDay: "2026-03-02", today: "2026-05-01", contract: "2,400,000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.covered, true);
  assert.deepEqual(r.notice, { date: "2026-05-31", daysLeft: 30, state: "open" });
  assert.equal(r.suitFrom, "2026-06-01");
  assert.equal(r.suitBy.date, "2027-03-02");
  assert.match(r.bond, /above the \$150,000 threshold/);
});

test("first tier: no statutory notice, same suit window", () => {
  const r = millerDeadlines({ tier: "first", lastDay: "2026-03-02", today: "2026-03-10" });
  assert.equal(r.notice, null);
  assert.equal(r.suitBy.date, "2027-03-02");
  assert.match(r.notes.join(" "), /no 90-day notice/);
  assert.match(r.bond, /not entered/);
});

test("29 February rolls to 28 February, the earlier date", () => {
  const r = millerDeadlines({ tier: "first", lastDay: "2028-02-29", today: "2028-03-01" });
  assert.equal(r.suitBy.date, "2029-02-28");
});

test("deadline states: soon, today, past", () => {
  assert.equal(millerDeadlines({ tier: "second", lastDay: "2026-03-02", today: "2026-05-20" }).notice.state, "soon");
  assert.equal(millerDeadlines({ tier: "second", lastDay: "2026-03-02", today: "2026-05-31" }).notice.state, "today");
  const late = millerDeadlines({ tier: "second", lastDay: "2026-03-02", today: "2026-06-15" });
  assert.equal(late.notice.state, "past");
  assert.equal(late.notice.daysLeft, -15);
  assert.match(late.notes.join(" "), /has passed/);
  const old = millerDeadlines({ tier: "first", lastDay: "2025-01-10", today: "2026-02-01" });
  assert.equal(old.suitBy.state, "past");
});

test("prime and remote tiers have no claim; remote cites Bateson", () => {
  assert.equal(millerDeadlines({ tier: "prime", lastDay: "2026-03-02", today: "2026-03-10" }).covered, false);
  const r = millerDeadlines({ tier: "remote", lastDay: "2026-03-02", today: "2026-03-10" });
  assert.equal(r.covered, false);
  assert.equal(r.notice, null);
  assert.match(r.notes.join(" "), /Bateson/);
});

test("bond thresholds from FAR 28.102-1", () => {
  const at = (contract) => millerDeadlines({ tier: "first", lastDay: "2026-03-02", today: "2026-03-10", contract }).bond;
  assert.match(at("150,000.01"), /above the \$150,000/);
  assert.match(at("150000"), /between \$35,000 and \$150,000/);
  assert.match(at("35000.01"), /between/);
  assert.match(at("35000"), /no payment bond/);
});

test("bad input is reported, not guessed", () => {
  const r = millerDeadlines({ tier: "x", lastDay: "2026-02-30", today: "", contract: "abc" });
  assert.equal(r.errors.length, 4);
  assert.equal(r.covered, false);
});

test("future last day gets a warning", () => {
  assert.match(millerDeadlines({ tier: "first", lastDay: "2026-12-01", today: "2026-11-25" }).notes.join(" "), /after today/);
});

test("notice names the amount and the party furnished to, and says nothing it cannot back", () => {
  const text = noticeLetter({ claimant: "Ridge Drywall LLC", prime: "Harbor Builders Inc.", furnishedTo: "Atlas Interiors", project: "VA clinic", contractNo: "36C24526C0001", amount: "18,450.00", lastDay: "2026-03-02", today: "2026-04-01" });
  assert.match(text, /\$18,450\.00/);
  assert.match(text, /furnished to, or performed for: Atlas Interiors\./);
  assert.match(text, /3133\(b\)\(2\)/);
  assert.match(text, /Federal contract number: 36C24526C0001/);
  assert.doesNotMatch(text, /interest|attorney|lawsuit|enclosed|attached/i);
  assert.doesNotMatch(text, /\n\n\n/);
  assert.equal(noticeLetter({ claimant: "A", prime: "B", furnishedTo: "", amount: "1", lastDay: "2026-03-02" }), "");
  assert.equal(noticeLetter({ claimant: "A", prime: "B", furnishedTo: "C", amount: "0", lastDay: "2026-03-02" }), "");
});
