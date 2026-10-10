import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, clean, tierCase, editBreakEven, DEFAULTS, money } from "./calc.mjs";

test("tier 2 hand-computed with defaults", () => {
  const { o } = clean({});
  const c = tierCase(o, 2, false);
  // drive 60 + shoot 55 + edit 35*2=70 + admin 15 = 200 min
  assert.equal(c.minutes.total, 200);
  // cost: mileage 2*14*0.67=18.76 + gear 4 + card 2.9% of 175 = 5.075 -> 27.835
  assert.ok(Math.abs(c.cost - 27.84) < 0.01);
  assert.ok(Math.abs(c.profit - (175 - 27.835)) < 0.01);
  assert.ok(Math.abs(c.hourly - (c.profit / (200 / 60))) < 0.01);
});

test("fee for target hourly delivers exactly the target hourly", () => {
  const { o } = clean({ targetHourly: 70 });
  const c = tierCase(o, 3);
  const o2 = { ...o, t3Fee: c.feeForTarget };
  assert.ok(Math.abs(tierCase(o2, 3).hourly - 70) < 0.02);
});

test("outsourcing removes edit time and adds cash cost", () => {
  const own = tierCase(clean({}).o, 1, false);
  const out = tierCase(clean({ editInHouse: 0 }).o, 1, false);
  assert.equal(out.minutes.edit, 0);
  assert.ok(Math.abs(out.cost - own.cost - 25 * 0.7) < 0.01);
  assert.ok(out.hourly > own.hourly);
});

test("underpriced small tier raises a high finding", () => {
  const e = estimate({ t1Fee: 60 });
  assert.ok(e.findings.some((f) => f.severity === "high" && /Tier 1/.test(f.title)));
});

test("a high price list says every tier clears the target", () => {
  const e = estimate({ t1Fee: 400, t2Fee: 500, t3Fee: 600, t4Fee: 800 });
  assert.ok(e.findings.some((f) => /Every tier clears/.test(f.title)));
});

test("edit break-even compares own time at target rate to the service", () => {
  const b = editBreakEven(clean({ editMinutesPerPhoto: 3, targetHourly: 60, outsourceCostPerPhoto: 0.5 }).o);
  assert.equal(b.ownCostPerPhoto, 3);
  assert.ok(b.outsourceWins);
  assert.ok(!editBreakEven(clean({ editMinutesPerPhoto: 0.5, targetHourly: 30, outsourceCostPerPhoto: 1 }).o).outsourceWins);
});

test("monthly profit is shoots x blended profit less overhead", () => {
  const e = estimate({});
  assert.ok(Math.abs(e.month.profit - (e.month.avgProfit * 30 - 450)) < 0.2);
  assert.ok(e.month.shootsToCoverOverhead > 0);
});

test("rejects negative and impossible input", () => {
  assert.ok(estimate({ driveMinutes: -1 }).error);
  assert.ok(estimate({ t2Photos: 0 }).error);
  assert.ok(estimate({ t1Fee: 0 }).error);
  assert.ok(estimate({ droneTakePct: 120 }).error);
  assert.ok(estimate({ mix1: 0, mix2: 0, mix3: 0, mix4: 0 }).error);
});

test("blank fields fall back to defaults", () => {
  assert.equal(estimate({ t1Fee: "" }).cases[0].fee, DEFAULTS.t1Fee);
});

test("money formats", () => assert.equal(money(1234.5), "$1,234.50"));
