import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, monthAt, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const zeros = { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0, next11: "" };

test("sample: 12 months total 77,400 is current turnover over 60,000", () => {
  const r = run({});
  assert.equal(r.current, 77400);
  assert.equal(r.trigger.kind, "current");
  assert.equal(r.trigger.registerBy, "2026-10-21");
});

test("month labels count back from the latest month across year ends", () => {
  assert.equal(monthAt(2026, 2, 11).label, "Feb 2026");
  assert.equal(monthAt(2026, 2, 0).label, "Mar 2025");
  assert.equal(monthAt(2026, 12, 0).label, "Jan 2026");
});

test("60,000 exactly is not a breach (the test is more than 60,000); 60,001 is", () => {
  assert.equal(run({ ...zeros, m12: 60001 }).trigger.kind, "current");
  assert.equal(run({ ...zeros, m12: 60000 }).trigger, null);
});

test("deadline is 21 days after month end, including leap-year February", () => {
  assert.equal(run({ ...zeros, m12: 80000, lastYear: 2028, lastMonth: 2 }).trigger.registerBy, "2028-03-21");
  assert.equal(run({ ...zeros, m12: 80000, lastYear: 2026, lastMonth: 12 }).trigger.registerBy, "2027-01-21");
});

test("projected turnover triggers when current does not", () => {
  const r = run({ ...zeros, m12: 6000, next11: 56000 });
  assert.equal(r.projected, 62000);
  assert.equal(r.trigger.kind, "projected");
});

test("projected below the line leaves no trigger", () => {
  assert.equal(run({ ...zeros, m12: 6000, next11: 54000 }).trigger, null);
});

test("blank projection means the projected test is skipped", () => {
  const r = run({ ...zeros, m12: 1000 });
  assert.equal(r.projected, null);
  assert.equal(r.trigger, null);
});

test("taxi and ride-share drivers register whatever the turnover", () => {
  assert.equal(run({ ...zeros, taxi: "yes" }).trigger.kind, "taxi");
});

test("near-threshold and fast run-rate raise medium findings", () => {
  assert.ok(run({ ...zeros, m12: 56000 }).findings.some((f) => f.severity === "medium"));
  const r = run({ ...zeros, m10: 5500, m11: 5500, m12: 5500 });
  assert.equal(r.runRate, 66000);
  assert.ok(r.findings.some((f) => /annualise/.test(f.title)));
});

test("not-required result points at voluntary registration and re-testing", () => {
  const r = run({ ...zeros, m12: 1000 });
  assert.ok(r.obligations.some((o) => o.ref === "Voluntary"));
  assert.ok(r.obligations.some((o) => o.ref === "Watch"));
});

test("negative, non-numeric and missing period input is rejected, not clamped", () => {
  assert.ok(run({ m1: -1 }).errors.length);
  assert.ok(run({ m1: "abc" }).errors.length);
  assert.ok(run({ next11: -5 }).errors.length);
  assert.ok(run({ lastMonth: 13 }).errors.length);
  assert.ok(parse({ ...SAMPLE, lastYear: "" }).errors.length);
});

test("summary names the source to verify", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
