import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, scenario, hours, sensitivity, num, money, toCsv } from "./calc.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("worked hours add visits, labor, admin and driving", () => {
  const h = hours(DEFAULTS);
  // 2*1.5 + 1*1.5 = 4.5 visit hours; trips 4, driving 4*2*25/60
  close(h.driving, (4 * 2 * 25) / 60);
  close(h.total, 4.5 + 14 + 3 + h.driving);
});

test("net per birth subtracts every cost line", () => {
  const r = scenario(DEFAULTS);
  close(r.fees, 36);
  close(r.backup, 1200 * 0.08 * 0.5);
  close(r.mileage, 4 * 2 * 15 * 0.725);
  close(r.overhead, 62.5);
  close(r.net, 1200 - r.fees - r.backup - r.mileage - 25 - 62.5);
  close(r.netAfterOnCall, r.net - 280);
});

test("fee for target hourly reproduces the target exactly", () => {
  const r = scenario(DEFAULTS);
  const again = scenario({ ...DEFAULTS, fee: r.feeForTarget });
  close(again.hourlyAfterOnCall, DEFAULTS.targetHourly, 1e-6);
});

test("longer labor lowers the hourly rate and raises the needed fee", () => {
  const rows = sensitivity(DEFAULTS);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].hourly < rows[i - 1].hourly);
    assert.ok(rows[i].feeForTarget > rows[i - 1].feeForTarget);
  }
});

test("yearly figures scale with births and tax set-aside", () => {
  const r = scenario(DEFAULTS);
  close(r.yearly, r.net * 24);
  close(r.afterTaxYearly, r.yearly * 0.7);
});

test("births needed for the yearly goal rounds up", () => {
  const r = scenario(DEFAULTS);
  assert.equal(r.birthsForGoal, Math.ceil(60000 / r.netAfterOnCall));
  assert.equal(scenario({ ...DEFAULTS, fee: 100 }).birthsForGoal, null);
});

test("bad input is reported, not computed", () => {
  assert.ok(analyze({ fee: -5 }).warnings.length);
  assert.ok(analyze({ birthsPerYear: 0 }).warnings.length);
  assert.ok(analyze({ feePct: 60, missedBirthPct: 100, backupPct: 100 }).warnings.length);
  assert.ok(analyze({ fee: NaN }).warnings.length);
  assert.equal(analyze({ fee: NaN }).result, null);
});

test("defaults analyse cleanly and flag under target", () => {
  const a = analyze({});
  assert.deepEqual(a.warnings, []);
  assert.equal(a.underTarget, a.result.hourlyAfterOnCall < DEFAULTS.targetHourly);
});

test("helpers parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.match(toCsv(analyze({})), /^labor_hours,/);
});

test("one birth a year is valid, a fraction is not", () => {
  assert.deepEqual(analyze({ birthsPerYear: 1 }).warnings, []);
  assert.ok(analyze({ birthsPerYear: 0.5 }).warnings.length);
});

test("default sensitivity table covers the five labor lengths", () => {
  assert.deepEqual(sensitivity(DEFAULTS).map((r) => r.labor), [8, 14, 20, 30, 40]);
});

test("csv has a header, one row per labor length and two-decimal numbers", () => {
  const lines = toCsv(analyze({})).trimEnd().split("\n");
  assert.equal(lines.length, 6);
  assert.equal(lines[0], "labor_hours,worked_hours,net_per_birth_usd,hourly_usd,hourly_after_on_call_usd,fee_for_target_usd");
  assert.equal(lines[1].split(",")[0], "8");
  for (const l of lines.slice(1)) assert.ok(l.split(",").slice(1).every((c) => /^-?\d+\.\d{2}$/.test(c)), l);
});
