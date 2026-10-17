import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, fieldsToRules, RULE_PRESETS, parsePayroll, toCsv, toText } from "./calc.mjs";

const R = fieldsToRules(RULE_PRESETS.federal.fields);
const run = (text, rules = R) => analyze({ text, rules });

test("hand-worked: $15/h, 50h, $100 bonus => regular rate 17.00, premium 0.5*17*10 = 85.00", () => {
  const w = run("Ana, W1, 50, 15, 100").weeks[0];
  assert.equal(w.includable, 850);
  assert.equal(w.regularRate, 17);
  assert.equal(w.otHours, 10);
  assert.equal(w.owed, 85);
  // blank 'paid' assumes the premium was paid on the base rate: 0.5*15*10 = 75
  assert.equal(w.paid, 75);
  assert.equal(w.paidAssumed, true);
  assert.equal(w.backPay, 10);
});

test("explicit overtime premium paid replaces the assumption; overpayment is not negative", () => {
  assert.equal(run("Ana, W1, 50, 15, 100, , , 85").weeks[0].backPay, 0);
  assert.equal(run("Ana, W1, 50, 15, 100, , , 60").weeks[0].backPay, 25);
  assert.equal(run("Ana, W1, 50, 15, 100, , , 100").weeks[0].backPay, 0);
  assert.equal(run("Ana, W1, 50, 15, 100, , , 0").weeks[0].paidAssumed, false);
});

test("threshold boundary: exactly 40h owes nothing, 40.5h owes half an hour", () => {
  const a = run("Ben, W1, 40, 20, 50").weeks[0];
  assert.equal(a.otHours, 0);
  assert.equal(a.owed, 0);
  assert.equal(a.regularRate, 21.25); // 850/40, still reported
  const b = run("Ben, W1, 40.5, 20, 0").weeks[0];
  assert.equal(b.otHours, 0.5);
  assert.equal(b.owed, 5); // 0.5*20*0.5
  assert.equal(b.backPay, 0);
  assert.equal(run("Ben, W1, 39.99, 20, 500").weeks[0].owed, 0);
});

test("shift differential or commission counts; excluded pay does not", () => {
  const w = run("Cy, W1, 45, 12, , 90, 25").weeks[0];
  assert.equal(w.includable, 630); // 540 + 90, the 25 excluded
  assert.equal(w.regularRate, 14);
  assert.equal(w.owed, 35); // 0.5*14*5
  assert.equal(w.paid, 30);
  assert.equal(w.backPay, 5);
  assert.equal(w.excluded, 25);
});

test("two rows for the same employee-week combine into a weighted regular rate", () => {
  // 30h at 15 + 20h at 18 = 450 + 360 = 810; 810/50 = 16.20; OT 10 => 81
  const r = run("Dee, W1, 30, 15\nDee, W1, 20, 18");
  assert.equal(r.weeks.length, 1);
  assert.equal(r.weeks[0].regularRate, 16.2);
  assert.equal(r.weeks[0].owed, 81);
  assert.equal(r.weeks[0].backPay, 0); // base-rate premium is already the weighted rate
});

test("editable rules: threshold, premium factor and liquidated multiplier", () => {
  // Threshold 35: 45h => 10 OT hours; 520/45 = 11.5556; 0.5*11.5556*10 = 57.78
  const rules = fieldsToRules({ ...RULE_PRESETS.custom.fields, otThresholdHours: 35 });
  assert.equal(run("Eli, W1, 45, 10, 70", rules).weeks[0].owed, 57.78);
  const full = fieldsToRules({ ...RULE_PRESETS.custom.fields, premiumFactor: 1.5 });
  assert.equal(run("Eli, W1, 50, 10", full).weeks[0].owed, 150); // 1.5*10*10
});

test("exposure projects the average weekly shortfall over the lookback", () => {
  // week A back pay 10, week B back pay 20 => 15/week => 15*52*2 = 1560, 3 yr 2340
  const r = run("Ana, A, 50, 15, 100\nAna, B, 50, 15, 200");
  assert.equal(r.backPay, 30);
  assert.equal(r.avgWeekly, 15);
  assert.equal(r.exposure.normal, 1560);
  assert.equal(r.exposure.willful, 2340);
  const dbl = run("Ana, A, 50, 15, 100\nAna, B, 50, 15, 200", fieldsToRules({ ...RULE_PRESETS.custom.fields, liquidatedMultiplier: 2 }));
  assert.equal(dbl.exposure.normal, 3120);
  const lb = fieldsToRules({ ...RULE_PRESETS.custom.fields, lookbackYears: 1, willfulYears: 5 });
  assert.equal(run("Ana, A, 50, 15, 100\nAna, B, 50, 15, 200", lb).exposure.willful, 3900);
});

test("per-employee and total roll-ups", () => {
  const r = run("Ana, A, 50, 15, 100\nBen, A, 45, 12, , 90\nCy, A, 30, 10");
  assert.equal(r.backPay, 15);
  assert.equal(r.shortWeeks, 2);
  assert.deepEqual(r.employees.map((e) => [e.name, e.backPay]), [["Ana", 10], ["Ben", 5], ["Cy", 0]]);
  assert.equal(r.owed, 120);
  assert.equal(r.paid, 105);
});

test("bad lines are reported, not guessed; comments, header and blank lines skipped", () => {
  const { rows, errors } = parsePayroll("Name, week, hours, rate\n# note\n\nAna, A, abc, 15\nBen, A, 40, -3\n, A, 40, 15\nCy, A, 40, 15, x\nDee, A, 0, 15\nEli, A, 41, 15");
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 5);
  assert.match(errors[0], /Line 4/);
});

test("empty input is empty output with no exposure", () => {
  const r = run("");
  assert.equal(r.backPay, 0);
  assert.equal(r.exposure, null);
});

test("CSV neutralises formulas and totals; text mentions assumption", () => {
  const r = run('=HYPERLINK("x"), A, 50, 15, 100');
  const csv = toCsv(r);
  assert.match(csv, /^employee,week/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /TOTAL/);
  assert.match(csv, /,10\.00\n$/);
  assert.match(toText(r), /assumed at base rate/);
  assert.match(toText(r), /Not legal advice/);
});
