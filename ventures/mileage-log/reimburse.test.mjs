import test from "node:test";
import assert from "node:assert/strict";
import { reimbursementClaim, reimbursementHtml } from "./reimburse.mjs";

const T = (o) => ({ id: o.date + (o.to || ""), category: "business", from: "Office", to: "Client", purpose: "Meeting", client: "", vehicle: "", odoStart: "", odoEnd: "", miles: 10, ...o });

test("employer rate prices business trips only, rows sum to total in cents", () => {
  const trips = [T({ date: "2026-02-01", miles: 10.3 }), T({ date: "2026-02-03", miles: 7.7 }), T({ date: "2026-02-04", category: "commute" }), T({ date: "2026-02-05", category: "personal" })];
  const c = reimbursementClaim(trips, { rate: 0.67 });
  assert.equal(c.rows.length, 2);
  assert.equal(c.miles, 18);
  assert.equal(c.cents, c.rows.reduce((s, r) => s + r.cents, 0));
  assert.equal(c.cents, 690 + 516); // 6.901->690, 5.159->516
  assert.equal(c.usedIrsRate, false);
});

test("blank rate falls back to the IRS rate in force on each trip date", () => {
  const c = reimbursementClaim([T({ date: "2026-03-01", miles: 100 }), T({ date: "2026-08-01", miles: 100 })], { rate: "" });
  assert.equal(c.usedIrsRate, true);
  assert.deepEqual(c.rows.map((r) => r.cents), [7250, 7600]);
  assert.equal(c.overIrsCents, 0);
});

test("date range is inclusive and client filter applies", () => {
  const trips = [T({ date: "2026-01-31" }), T({ date: "2026-02-01", client: "A" }), T({ date: "2026-02-28", client: "B" }), T({ date: "2026-03-01" })];
  assert.equal(reimbursementClaim(trips, { from: "2026-02-01", to: "2026-02-28", rate: 1 }).rows.length, 2);
  assert.equal(reimbursementClaim(trips, { client: "A", rate: 1 }).rows.length, 1);
});

test("rate above the IRS rate reports the taxable excess; negative/NaN rate is ignored", () => {
  const over = reimbursementClaim([T({ date: "2026-03-01", miles: 100 })], { rate: 0.80 });
  assert.equal(over.overIrsCents, 8000 - 7250);
  assert.equal(reimbursementClaim([T({ date: "2026-03-01" })], { rate: -1 }).usedIrsRate, true);
  assert.equal(reimbursementClaim([T({ date: "2026-03-01" })], { rate: "abc" }).usedIrsRate, true);
});

test("zero-mile trips are skipped, incomplete trips flagged, months grouped", () => {
  const c = reimbursementClaim([T({ date: "2026-01-02", miles: 0 }), T({ date: "2026-01-03", purpose: "" }), T({ date: "2026-02-03" })], { rate: 0.5 });
  assert.equal(c.rows.length, 2);
  assert.equal(c.incomplete, 1);
  assert.deepEqual(c.months.map((m) => m.month), ["2026-01", "2026-02"]);
});

test("odometer miles are used and html escapes user text", () => {
  const html = reimbursementHtml([T({ date: "2026-02-01", odoStart: 100, odoEnd: 125, to: "<script>x</script>", purpose: "a&b" })], { rate: 0.5, name: "<b>Eve</b>", employer: "Acme" });
  assert.ok(!html.includes("<script>x"));
  assert.ok(!html.includes("<b>Eve"));
  assert.ok(html.includes("$12.50"));
  assert.ok(html.includes("a&amp;b"));
});
