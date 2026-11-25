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

test("discount is taken on the scheduled premium; terrorism and catastrophe ride on payroll, outside mod and discount", () => {
  // Hand count: 100000 / 100 x 10 = 10000 manual; x 1.2 = 12000; x 1.10 = 13200
  // discountable; 5% discount = 660 (on 13200, not on the 12000 pre-schedule
  // amount, which would give 600); 12540 after discount; 2% surcharge = 250.80;
  // 0.02 per $100 on 100000 payroll = 20 (not 24: the mod does not apply);
  // + 200 expense constant = 13010.80.
  const r = policyPremium({ classes: [{ payroll: 100000, rate: 10 }], mod: 1.2, schedulePct: 10, discountPct: 5,
    surchargePct: 2, payrollChargeRate: 0.02, expenseConstant: 200 });
  assert.equal(r.scheduled, 13200);
  assert.equal(r.discount, 660);
  assert.equal(r.afterDiscount, 12540);
  assert.equal(r.surcharges, 250.8);
  assert.equal(r.payrollCharges, 20);
  assert.equal(r.total, 13010.8);
});

test("terrorism and catastrophe use the premium basis, after the overtime exclusion", () => {
  // 30000 overtime at 1.5x excludes 10000, so the basis is 90000: 900 x 0.03 = 27.
  const r = policyPremium({ classes: [{ payroll: 100000, rate: 0, overtimeWages: 30000 }], payrollChargeRate: 0.03 });
  assert.equal(r.payrollCharges, 27);
  assert.equal(r.total, 27);
});

test("validation limits hold exactly at their edges", () => {
  const one = [{ payroll: 1000, rate: 5 }];
  assert.equal(policyPremium({ classes: one, schedulePct: 25 }).schedulePct, 25);
  assert.equal(policyPremium({ classes: one, schedulePct: -25 }).schedulePct, -25);
  assert.throws(() => policyPremium({ classes: one, schedulePct: 25.5 }), /schedule credit\/debit must be between -25 and 25/);
  assert.throws(() => policyPremium({ classes: one, schedulePct: -25.5 }), /between -25 and 25/);
  assert.equal(policyPremium({ classes: one, discountPct: 30 }).discountPct, 30);
  assert.throws(() => policyPremium({ classes: one, discountPct: 30.5 }), /premium discount must be between 0 and 30/);
  assert.equal(policyPremium({ classes: one, mod: 0.3 }).mod, 0.3);
  assert.equal(policyPremium({ classes: one, mod: 3 }).mod, 3);
  assert.throws(() => policyPremium({ classes: one, mod: 0.29 }), /experience mod must be between 0.3 and 3/);
  assert.throws(() => policyPremium({ classes: one, payrollChargeRate: 5.01 }), /terrorism and catastrophe rate/);
  assert.throws(() => policyPremium({ classes: one, payrollChargeRate: -0.01 }), /terrorism and catastrophe rate/);
});

test("mod sensitivity refuses a zero step instead of dividing by a made-up 1", () => {
  assert.throws(() => modSensitivity({ classes: [{ payroll: 100000, rate: 10 }] }, 0), /mod step/);
});

test("findings thresholds: dominant class at 60%, flat charges above 15%", () => {
  const at60 = findings(policyPremium({ classes: [{ label: "A", payroll: 60000, rate: 1 }, { label: "B", payroll: 40000, rate: 1 }] }));
  assert.ok(at60.some((x) => /A drives 60%/.test(x.title)));
  const under = findings(policyPremium({ classes: [{ label: "A", payroll: 59900, rate: 1 }, { label: "B", payroll: 40100, rate: 1 }] }));
  assert.ok(!under.some((x) => /drives/.test(x.title)));
  // 850 manual + 150 constant: exactly 15% of 1000 is not flagged; 849 + 151 is.
  const flat15 = findings(policyPremium({ classes: [{ payroll: 8500, rate: 10 }], expenseConstant: 150 }));
  assert.ok(!flat15.some((x) => /Flat charges/.test(x.title)));
  const flat151 = findings(policyPremium({ classes: [{ payroll: 8490, rate: 10 }], expenseConstant: 151 }));
  assert.ok(flat151.some((x) => /Flat charges are 15%/.test(x.title)));
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
