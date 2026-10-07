import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandoff, parseCents, parseMilestones, splitByPercent, paymentSchedule, lateFeeExample, killFee, check, buildAgreement, agreementText, reviewNotes, formatMoney } from "./calc.mjs";

const base = { contractor: "Ada Dev", client: "Acme Co", project: "Build a marketing site", deliverables: "Home page\nPricing page", amount: "5,000", law: "Colorado, USA" };

test("parseCents handles symbols, commas and bad input", () => {
  assert.equal(parseCents("$1,234.50"), 123450);
  assert.equal(parseCents("0.1"), 10);
  assert.equal(parseCents(""), null);
  assert.equal(parseCents("abc"), null);
  assert.equal(parseCents("-5"), null);
});

test("split by percent always sums to the total", () => {
  for (const total of [100001, 333, 1, 999999]) {
    const parts = splitByPercent(total, [33.33, 33.33, 33.34]);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

test("milestones parse and report malformed lines", () => {
  const r = parseMilestones("Design | 30\nBuild | 20%\nbroken\n | 5");
  assert.deepEqual(r.rows, [{ name: "Design", pct: 30 }, { name: "Build", pct: 20 }]);
  assert.equal(r.problems.length, 2);
});

test("schedule: deposit, milestones and balance add to the fee", () => {
  const s = paymentSchedule({ ...base, feeType: "fixed", depositPct: "40", milestones: "Draft | 30" });
  assert.deepEqual(s.rows.map((r) => r.cents), [200000, 150000, 150000]);
  assert.equal(s.rows[2].name, "Balance, due on final delivery");
  assert.equal(s.rows.reduce((a, r) => a + r.cents, 0), 500000);
});

test("schedule flags percentages over 100 and skips non-fixed fees", () => {
  assert.ok(paymentSchedule({ ...base, feeType: "fixed", depositPct: "70", milestones: "A | 50" }).problems.length);
  assert.equal(paymentSchedule({ ...base, feeType: "hourly" }).rows.length, 0);
});

test("late fee and kill fee are priced in cents", () => {
  assert.equal(lateFeeExample({ ...base, lateFeePct: "1.5" }), 7500);
  assert.equal(lateFeeExample({ ...base, lateFeePct: "0" }), null);
  assert.equal(killFee({ ...base, feeType: "fixed", killFeePct: "25" }), 125000);
  assert.equal(killFee({ ...base, feeType: "hourly", killFeePct: "25" }), null);
});

test("check lists what is missing and warns on a high late fee", () => {
  assert.deepEqual(check({ ...base, feeType: "fixed", depositPct: "50" }), []);
  const bad = check({ feeType: "fixed", lateFeePct: "10", payDays: "14", amount: "" });
  assert.ok(bad.length >= 6);
  assert.ok(bad.some((x) => /unenforceable/.test(x)));
});

test("agreement contains the parties, scope, amounts and numbered clauses in order", () => {
  const text = agreementText(buildAgreement({ ...base, feeType: "fixed", depositPct: "50" }));
  assert.match(text, /Ada Dev \("Contractor"\) and Acme Co \("Client"\)/);
  assert.match(text, /fixed fee of \$5,000\.00/);
  assert.match(text, /Deposit, due on signing: \$2,500\.00 \(50%\)/);
  assert.match(text, /\(a\) Home page/);
  assert.match(text, /laws of Colorado, USA/);
  const nums = [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

test("turning confidentiality off renumbers cleanly", () => {
  const text = agreementText(buildAgreement({ ...base, feeType: "fixed", confidential: false }));
  assert.doesNotMatch(text, /Confidentiality/);
  const nums = [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

test("hourly and retainer variants say the right thing", () => {
  const h = agreementText(buildAgreement({ ...base, feeType: "hourly", amount: "90", hoursEstimate: "40" }));
  assert.match(h, /\$90\.00 per hour/);
  assert.match(h, /estimate, not a cap/);
  assert.match(h, /revisions are billed at the hourly rate/);
  const r = agreementText(buildAgreement({ ...base, feeType: "retainer", amount: "2000" }));
  assert.match(r, /monthly retainer of \$2,000\.00/);
  assert.doesNotMatch(r, /cancellation fee/);
});

test("ownership options differ and termination carries the kill fee", () => {
  const a = agreementText(buildAgreement({ ...base, feeType: "fixed", ip: "on-payment" }));
  const b = agreementText(buildAgreement({ ...base, feeType: "fixed", ip: "license" }));
  assert.match(a, /assigns to Client the copyright/);
  assert.match(b, /non-exclusive, worldwide, perpetual licence/);
  assert.match(a, /cancellation fee of 25% of the project fee \(\$1,250\.00\)/);
});

test("late fee wording is dropped when zero; zero-day terms read as on receipt", () => {
  const t = agreementText(buildAgreement({ ...base, feeType: "fixed", lateFeePct: "0", payDays: "0" }));
  assert.doesNotMatch(t, /late fee/);
  assert.match(t, /due on receipt/);
});

test("missing fields become visible placeholders, never undefined", () => {
  const t = agreementText(buildAgreement({}));
  assert.match(t, /\[Contractor\]/);
  assert.doesNotMatch(t, /undefined|NaN/);
});

test("review notes flag risky choices", () => {
  const n = reviewNotes({ ...base, feeType: "fixed", depositPct: "0", payDays: "60", liabilityCap: false, revisions: "0", law: "" });
  assert.ok(n.length >= 5);
  assert.deepEqual(reviewNotes({ ...base, feeType: "fixed", depositPct: "50", payDays: "14", liabilityCap: true, revisions: "2", ip: "license" }), []);
});

test("money format", () => {
  assert.equal(formatMoney(123456, "USD"), "$1,234.56");
  assert.equal(formatMoney(150000, "JPY"), "¥1,500");
});

test("hand-off hash fills known text fields only", () => {
  const h = "#handoff=" + encodeURIComponent(JSON.stringify({ client: "Acme", amount: "6000", currency: "EUR", feeType: "hourly", evil: "x", payDays: 7 }));
  assert.deepEqual(parseHandoff(h), { client: "Acme", amount: "6000", currency: "EUR" });
  assert.equal(parseHandoff("#handoff=%7Bbad"), null);
  assert.equal(parseHandoff(""), null);
  assert.equal(parseHandoff("#handoff=" + encodeURIComponent('{"currency":"XXX"}')), null);
});
