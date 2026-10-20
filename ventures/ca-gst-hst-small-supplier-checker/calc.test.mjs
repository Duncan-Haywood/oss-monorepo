import { test } from "node:test";
import assert from "node:assert/strict";
import { quickCompare, compute, summaryText, SAMPLE, VERIFY, quarterAt, rollingEffective, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const zeros = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0, q8: 0 };

test("sample: 6,800+7,400+8,200+9,300 = 31,700 first crosses at Q2 2026", () => {
  const r = run({});
  assert.equal(r.trigger.kind, "rolling");
  assert.equal(r.trigger.label, "Q2 2026");
  assert.equal(r.trigger.effective, "2026-08-01");
  assert.equal(r.trigger.registerBy, "2026-08-30");
  assert.equal(r.quarters[7].rolling, 35300);
});

test("quarter labels count back from the latest quarter across year ends", () => {
  assert.equal(quarterAt(2026, 1, 7).label, "Q1 2026");
  assert.equal(quarterAt(2026, 1, 0).label, "Q2 2024");
  assert.equal(quarterAt(2026, 3, 4).label, "Q4 2025");
});

test("rolling breach starts charging the day after the end of the following month", () => {
  assert.equal(rollingEffective(2026, 3), "2026-05-01");
  assert.equal(rollingEffective(2026, 9), "2026-11-01");
  assert.equal(rollingEffective(2026, 12), "2027-02-01");
});

test("exactly 30,000 over four quarters is not a breach; 30,001 is", () => {
  assert.equal(run({ ...zeros, q8: 30000 }).trigger, null);
  assert.equal(run({ ...zeros, q8: 15000, q7: 15000 }).trigger, null);
  assert.equal(run({ ...zeros, q8: 15001, q7: 15000 }).trigger.kind, "rolling");
});

test("a single quarter above 30,000 is a single-quarter breach, not a rolling one", () => {
  const r = run({ ...zeros, q6: 30001 });
  assert.equal(r.trigger.kind, "single");
  assert.match(r.findings[0].title, /29 days/);
});

test("the earliest breach wins", () => {
  const r = run({ ...zeros, q3: 31000, q8: 31000 });
  assert.equal(r.trigger.label, quarterAt(2026, 3, 2).label);
});

test("taxi and ride-share operators are registrants regardless of revenue", () => {
  const r = run({ ...zeros, taxi: "yes" });
  assert.equal(r.trigger.kind, "taxi");
});

test("near-threshold totals raise a medium finding when nothing is breached", () => {
  const r = run({ ...zeros, q8: 14000, q7: 14000 });
  assert.equal(r.trigger, null);
  assert.ok(r.findings.some((f) => f.severity === "medium"));
});

test("not-required result points at voluntary registration and re-testing", () => {
  const r = run({ ...zeros, q8: 1000 });
  assert.ok(r.obligations.some((o) => o.ref === "Voluntary"));
  assert.ok(r.obligations.some((o) => o.ref === "Watch"));
});

test("negative, non-numeric and missing period input is rejected, not clamped", () => {
  assert.ok(run({ q1: -1 }).errors.length);
  assert.ok(run({ q1: "abc" }).errors.length);
  assert.ok(run({ lastQ: 5 }).errors.length);
  assert.ok(parse({ ...SAMPLE, lastYear: "" }).errors.length);
});

test("Quebec note appears only when asked", () => {
  assert.ok(run({ quebec: "yes" }).findings.some((f) => /QST/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /QST/.test(f.title)));
});

test("summary names the source to verify", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});

test("quick method: Ontario services with few costs remits less", () => {
  const q = quickCompare({ sales: 38000, costs: 4000, region: "on13", kind: "services" });
  assert.equal(q.ok, true);
  assert.ok(Math.abs(q.quickPay - (38000 * 1.13 * 0.088 - 300)) < 1e-6);
  assert.ok(Math.abs(q.regularPay - 34000 * 0.13) < 1e-6);
  assert.ok(q.diff > 0);
});

test("quick method: heavy costs favour regular accounting; bad input rejected; limit flagged", () => {
  assert.ok(quickCompare({ sales: 50000, costs: 40000, region: "gst5", kind: "goods" }).diff < 0);
  assert.equal(quickCompare({ sales: 1, costs: 1, region: "x", kind: "goods" }).ok, false);
  assert.equal(quickCompare({ sales: -1, costs: 1, region: "gst5", kind: "goods" }).ok, false);
  assert.ok(quickCompare({ sales: 500000, costs: 0, region: "gst5", kind: "goods" }).findings.some((f) => f.severity === "high"));
});
