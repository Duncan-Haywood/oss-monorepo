import { test } from "node:test";
import assert from "node:assert/strict";
import { efficiencyOutcome, burnBand, validate } from "./calc.mjs";

const base = { revenue: 1_500_000, priorRevenue: 1_300_000, yearAgoRevenue: 900_000, priorSalesMarketing: 600_000, netBurn: 900_000, cash: 5_400_000 };

test("estimates net new ARR from revenue delta x4 and derives the headline metrics", () => {
  const r = efficiencyOutcome(base);
  assert.equal(r.netNewArr, 800_000);
  assert.ok(Math.abs(r.burnMultiple - 900_000 / 800_000) < 1e-9);
  assert.ok(Math.abs(r.magicNumber - 800_000 / 600_000) < 1e-9);
  assert.ok(Math.abs(r.growth - (1_500_000 / 900_000 - 1)) < 1e-9);
  assert.ok(Math.abs(r.margin - -0.6) < 1e-9);
  assert.ok(Math.abs(r.ruleOf40 - (66.6666667 - 60)) < 1e-4);
  assert.equal(r.runwayMonths, 18);
});

test("explicit net new ARR overrides the revenue proxy", () => {
  const r = efficiencyOutcome({ ...base, netNewArr: 450_000 });
  assert.ok(Math.abs(r.burnMultiple - 2) < 1e-9);
  assert.match(r.arrSource, /entered/);
  assert.equal(r.magicNumber, 800_000 / 600_000, "magic number always uses revenue delta");
});

test("band boundaries", () => {
  assert.equal(burnBand(0.99), "amazing");
  assert.equal(burnBand(1), "great");
  assert.equal(burnBand(1.5), "good");
  assert.equal(burnBand(2), "suspect");
  assert.equal(burnBand(3), "bad");
});

test("cash-generating quarter has no burn multiple and no runway", () => {
  const r = efficiencyOutcome({ ...base, netBurn: -100_000 });
  assert.equal(r.burnMultiple, null);
  assert.equal(r.runwayMonths, null);
  assert.ok(r.margin > 0);
});

test("burning with no ARR growth is flagged, not divided by zero", () => {
  const r = efficiencyOutcome({ ...base, revenue: 1_300_000, priorRevenue: 1_300_000 });
  assert.equal(r.burnMultiple, null);
  assert.match(r.burnNote, /unbounded/);
});

test("target view shows burn cut or ARR needed to reach 1.5", () => {
  const r = efficiencyOutcome({ ...base, netNewArr: 450_000 });
  assert.equal(r.target.burnAtSameArr, 675_000);
  assert.equal(r.target.arrAtSameBurn, 600_000);
  assert.equal(efficiencyOutcome(base).target, null);
});

test("optional fields may be blank", () => {
  const r = efficiencyOutcome({ revenue: 100, priorRevenue: 90, netBurn: 50, yearAgoRevenue: "", priorSalesMarketing: "", cash: "" });
  assert.equal(r.magicNumber, null);
  assert.equal(r.ruleOf40, null);
  assert.equal(r.runwayMonths, null);
  assert.ok(r.burnMultiple > 0);
});

test("validation rejects bad input with a message", () => {
  assert.match(validate({}).invalid, /this quarter/);
  assert.match(validate({ revenue: 1, priorRevenue: 0, netBurn: 1 }).invalid, /last quarter/);
  assert.match(validate({ revenue: 1, priorRevenue: 1 }).invalid, /net burn/i);
  assert.match(validate({ revenue: 1, priorRevenue: 1, netBurn: 1, cash: -5 }).invalid, /Cash/);
});
