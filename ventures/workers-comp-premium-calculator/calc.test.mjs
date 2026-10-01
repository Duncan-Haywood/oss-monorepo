import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overtimeExclusion, classPremium, policyPremium, modSensitivity, auditTrueUp, reclassImpact, findings } from "./calc.mjs";

const POLICY = {
  classes: [
    { label: "Roofing", payroll: 200000, rate: 18.5, overtimeWages: 20000, overtimeMultiplier: 1.5 },
    { label: "Clerical", payroll: 40000, rate: 0.35 },
  ],
  mod: 1.12,
  schedulePct: 5,
  expenseConstant: 250,
};

test("overtime exclusion is the premium half: a third of each dollar at time-and-a-half", () => {
  assert.equal(overtimeExclusion(30000, 1.5), 10000);
  assert.equal(overtimeExclusion(20000, 1.5), 6666.67);
  assert.equal(overtimeExclusion(10000, 2), 5000);
  assert.equal(overtimeExclusion("", 1.5), 0);
});

test("class premium is basis / 100 x rate, hand counted", () => {
  const c = classPremium(POLICY.classes[0]);
  assert.equal(c.basis, 193333.33);
  assert.equal(c.manual, 35766.67); // 1933.3333 x 18.50
  assert.equal(classPremium(POLICY.classes[1]).manual, 140); // 400 x 0.35
});

test("policy premium chains manual, mod, schedule, constant", () => {
  const r = policyPremium(POLICY);
  assert.equal(r.manual, 35906.67);
  assert.equal(r.modified, 40215.47); // x 1.12
  assert.equal(r.scheduled, 42226.24); // x 1.05
  assert.equal(r.total, 42476.24); // + 250
  assert.equal(r.payroll, 240000);
});

test("discount applies before surcharges and the flat constant", () => {
  const r = policyPremium({ classes: [{ payroll: 100000, rate: 10 }], discountPct: 10, surchargePct: 5, expenseConstant: 100 });
  assert.equal(r.manual, 10000);
  assert.equal(r.discount, 1000);
  assert.equal(r.surcharges, 450); // 5% of 9000
  assert.equal(r.total, 9550);
});

test("mod sensitivity: 0.1 of mod on a 35906.67 manual premium", () => {
  const s = modSensitivity({ classes: [{ payroll: 100000, rate: 10 }], mod: 1 });
  assert.equal(s.up, 1000);
  assert.equal(s.down, 1000);
  assert.equal(s.per001, 100);
});

test("audit true-up: extra payroll produces additional premium at the same rates", () => {
  const est = { classes: [{ payroll: 100000, rate: 10 }], mod: 1 };
  const a = auditTrueUp(est, [{ payroll: 130000, rate: 10 }]);
  assert.equal(a.diff, 3000);
  assert.equal(a.direction, "additional");
  const b = auditTrueUp(est, [{ payroll: 80000, rate: 10 }]);
  assert.equal(b.diff, -2000);
  assert.equal(b.direction, "return");
});

test("reclass impact is signed and scaled by the mod", () => {
  assert.equal(reclassImpact(50000, 8, 12, 1), 2000);
  assert.equal(reclassImpact(50000, 12, 8, 1.1), -2200);
});

test("bad input throws instead of guessing", () => {
  assert.throws(() => policyPremium({ classes: [] }), /at least one class/);
  assert.throws(() => policyPremium({ classes: [{ payroll: 1000, rate: "x" }] }), /must be a number/);
  assert.throws(() => policyPremium({ classes: [{ payroll: 1000, rate: 5 }], mod: 9 }), /between/);
  assert.throws(() => classPremium({ payroll: 1000, rate: 5, overtimeWages: 5000 }), /cannot exceed/);
});

test("findings flag a debit mod and dominant class", () => {
  const f = findings(policyPremium(POLICY));
  assert.ok(f.some((x) => x.severity === "high" && /experience mod adds/.test(x.title)));
  assert.ok(f.some((x) => /Roofing drives 100%/.test(x.title)));
  assert.ok(f.some((x) => /schedule debit/.test(x.title)));
});

test("calc has no network access", () => {
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /\bfetch\(|XMLHttpRequest/);
});
