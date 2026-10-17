import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, CONTROL_INDICATORS, SCOPE_QUESTIONS, SYSTEMS, VERIFY, strength, daysToDeadline } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const none = Object.fromEntries([...CONTROL_INDICATORS, ...SYSTEMS].map((q) => [q.id, "no"]));

test("all four scope tests met means a covered platform", () => {
  const r = run({});
  assert.equal(r.inScope, true);
  assert.match(r.findings[0].title, /Likely a digital labour platform/);
});

test("each failed scope test takes it out of scope and names the test", () => {
  for (const q of SCOPE_QUESTIONS.filter((x) => x.id !== "automated")) {
    const r = run({ [q.id]: "no" });
    assert.equal(r.inScope, false, q.id);
    assert.equal(r.borderline, false, q.id);
    assert.match(r.findings[0].title, /Probably out of scope/);
  }
});

test("missing only the automation test is borderline, with the automation warning", () => {
  const r = run({ automated: "no" });
  assert.equal(r.borderline, true);
  assert.match(r.findings[0].title, /Borderline/);
});

test("indicator counts map to none, weak, arguable and strong", () => {
  assert.equal(strength(0).level, "none");
  assert.equal(strength(1).level, "weak");
  assert.equal(strength(2).level, "arguable");
  assert.equal(strength(3).level, "arguable");
  assert.equal(strength(4).level, "strong");
  assert.equal(run({ ...none }).indicators, 0);
  assert.equal(run({ ...none, paySet: "yes", conduct: "yes", supervised: "yes", restrictedFreedom: "yes", restrictedClients: "yes" }).strength.level, "strong");
});

test("the presumption finding always says rebuttable and national law", () => {
  const f = run({}).findings.find((x) => /rebuttable/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /national law/);
  assert.match(f.title, /not the legal test/);
});

test("prohibited-processing systems are high findings for operators and questions for workers", () => {
  const op = run({ emotion: "yes", privateComms: "yes" });
  assert.equal(op.findings.filter((f) => f.severity === "high" && /Restricted processing/.test(f.title)).length, 2);
  const w = run({ role: "worker", emotion: "yes" });
  assert.ok(w.findings.some((f) => /Ask about it/.test(f.title)));
  assert.ok(!w.findings.some((f) => /Restricted processing/.test(f.title)));
});

test("automated decisions get the written-reasons and human-review finding for both roles", () => {
  assert.ok(run({}).findings.some((f) => /Automated decisions/.test(f.title) && /human review/.test(f.title)));
  assert.ok(run({ role: "worker" }).findings.some((f) => /written statement of reasons/.test(f.title)));
  assert.ok(!run({ autoDecisions: "no" }).findings.some((f) => /written statement of reasons/.test(f.title)));
});

test("countdown to 2 December 2026", () => {
  assert.equal(daysToDeadline(new Date("2026-12-01T00:00:00Z")), 1);
  assert.match(run({ asOf: "2026-10-13" }).findings.map((f) => f.title).join(" "), /50 days/);
  assert.match(run({ asOf: "2027-01-01" }).findings.map((f) => f.title).join(" "), /has passed/);
  assert.equal(run({ asOf: "" }).days, null);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({}).errors.length >= 1);
  assert.ok(run({ role: "nope" }).errors.length);
  assert.ok(run({ viaApp: "maybe" }).errors.length);
  assert.ok(run({ asOf: "not-a-date" }).errors.length);
});

test("summary names the source and the not-advice line", () => {
  const s = summaryText(run({}));
  assert.match(s, /In scope as a digital labour platform: yes/);
  assert.ok(s.includes(VERIFY));
  assert.match(s, /employment lawyer/);
});
