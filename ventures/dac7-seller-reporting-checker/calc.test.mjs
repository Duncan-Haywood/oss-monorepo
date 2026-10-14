import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, ACTIVITIES, VERIFY } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("goods under 30 sales and EUR 2,000 are not reported and show headroom", () => {
  const r = run({ transactions: 12, consideration: 900 });
  assert.equal(r.reportable, false);
  assert.equal(r.headroom.sales, 17);
  assert.equal(r.headroom.amount, 1100);
});

test("30 sales makes the year reportable even with low value", () => {
  assert.equal(run({ transactions: 30, consideration: 100 }).reportable, true);
  assert.equal(run({ transactions: 29, consideration: 100 }).reportable, false);
});

test("exactly EUR 2,000 is still exempt, one cent over is not", () => {
  assert.equal(run({ transactions: 5, consideration: 2000 }).reportable, false);
  assert.equal(run({ transactions: 5, consideration: 2000.01 }).reportable, true);
});

test("either limit alone loses the exemption and the reason names it", () => {
  const r = run({ transactions: 5, consideration: 3500 });
  assert.match(r.reason, /3,500/);
  assert.doesNotMatch(r.reason, /5 sales/);
});

test("services, property and transport have no de minimis exemption", () => {
  for (const a of ["services", "property", "transport"]) {
    const r = run({ activity: a, transactions: 1, consideration: 50 });
    assert.equal(r.reportable, true, a);
    assert.match(r.reason, /no de minimis/);
  }
});

test("excluded sellers are never reported", () => {
  assert.equal(run({ activity: "property", sellerType: "excluded", transactions: 400, consideration: 1e6 }).reportable, false);
});

test("a missing TIN on a reportable seller is a high finding naming the 60-day rule", () => {
  const f = run({ transactions: 50, hasTin: "no" }).findings.find((x) => /tax identification number/.test(x.title) && x.severity === "high");
  assert.ok(f);
  assert.match(f.title, /60 days/);
  assert.ok(!run({ transactions: 50, hasTin: "yes" }).findings.some((x) => x.severity === "high" && /not got your tax identification/.test(x.title)));
});

test("multiple platforms get the per-operator note", () => {
  assert.ok(run({ platforms: 3 }).findings.some((f) => /per platform operator/.test(f.title)));
  assert.ok(!run({ platforms: 1 }).findings.some((f) => /per platform operator/.test(f.title)));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(run({ transactions: -1 }).errors.length);
  assert.ok(run({ transactions: 2.5 }).errors.length);
  assert.ok(run({ consideration: "abc" }).errors.length);
  assert.ok(run({ consideration: "" }).errors.length);
  assert.ok(run({ platforms: 0 }).errors.length);
  assert.ok(run({ activity: "nope" }).errors.length);
  assert.ok(run({ sellerType: "nope" }).errors.length);
});

test("every activity has a per-activity reporting description in the findings", () => {
  for (const a of ACTIVITIES) {
    const r = run({ activity: a.id, transactions: 100, consideration: 99999 });
    assert.ok(r.findings.some((f) => /What the platform sends/.test(f.title)), a.id);
  }
});

test("summary says reported or not, names the source and the not-advice line", () => {
  const s = summaryText(run({}));
  assert.match(s, /Likely reported by the platform: yes/);
  assert.ok(s.includes(VERIFY));
  assert.match(s, /not legal or tax advice/);
});
