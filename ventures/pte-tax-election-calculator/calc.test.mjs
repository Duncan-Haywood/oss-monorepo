import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, effectiveCap, scenario, compare, firstPayingIncome, sensitivity } from "./calc.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test("num parses money and percent text, NaN on blank", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("6%"), 6);
  assert.ok(Number.isNaN(num("")));
});

test("effective cap: full below the threshold, phased out above, floored", () => {
  assert.equal(effectiveCap(DEFAULTS, 500000), 40400);
  close(effectiveCap(DEFAULTS, 555000), 40400 - 0.3 * 50000, "phase-out");
  assert.equal(effectiveCap(DEFAULTS, 5000000), 10000);
});

// Hand-worked: MAGI 500,000 is under the threshold so the cap is not binding either way.
test("worked example, cap not binding: the election costs money (QBI haircut only)", () => {
  const c = compare(DEFAULTS);
  close(c.no.taxable, 359000, "no-election taxable");
  close(c.no.federal, 125650, "no-election federal");
  close(c.yes.taxable, 363800, "election taxable");
  close(c.yes.federal, 127330, "election federal");
  close(c.savings, -1680, "savings");
  assert.equal(c.helps, false);
  close(c.parts.qbiLoss, -1680, "qbi part");
});

// Hand-worked: $1M of pass-through income, cap floored at $10,000 both ways.
test("worked example, cap binding: savings are the rate times (PTET minus other SALT minus QBI lost)", () => {
  const o = { ...DEFAULTS, pteIncome: 1000000 };
  const c = compare(o);
  close(c.no.total, 362750, "no-election total");
  close(c.yes.total, 345950, "election total");
  close(c.savings, 16800, "savings");
  assert.equal(c.helps, true);
  close(c.no.saltStuck, 62000, "state tax above the cap without the election");
});

test("the election never changes the state bill when the credit equals the personal tax", () => {
  const c = compare({ ...DEFAULTS, pteIncome: 750000 });
  close(c.stateChange, 0, "state change");
});

test("a credit larger than the personal tax is wasted, not refunded", () => {
  const s = scenario({ ...DEFAULTS, pteRatePct: 9, personalRatePct: 6 }, true);
  close(s.personalState, 0, "personal state");
  close(s.wastedCredit, 400000 * 0.03, "wasted credit");
  assert.ok(compare({ ...DEFAULTS, pteRatePct: 9, personalRatePct: 6 }).stateChange > 0);
});

test("a partial credit leaves some personal state tax", () => {
  const s = scenario({ ...DEFAULTS, creditPct: 50 }, true);
  close(s.personalState, 400000 * 0.06 - 0.5 * 400000 * 0.06, "partial");
});

test("no pass-through income means no difference", () => {
  const c = compare({ ...DEFAULTS, pteIncome: 0 });
  close(c.savings, 0, "zero income");
  assert.equal(c.helps, false);
});

test("a zero federal rate makes the federal effect vanish", () => {
  close(compare({ ...DEFAULTS, pteIncome: 1000000, fedRatePct: 0 }).federalSavings, 0, "fed");
});

test("savings rise with the federal rate when the cap binds", () => {
  const g = sensitivity({ ...DEFAULTS, pteIncome: 1000000 });
  const row = g[2].cells.map((c) => c.savings);
  for (let i = 1; i < row.length; i++) assert.ok(row[i] > row[i - 1]);
});

test("first paying income exists for the defaults and sits where the cap starts to bind", () => {
  const x = firstPayingIncome(DEFAULTS);
  assert.ok(x !== null && x > 100000 && x < 2000000, String(x));
  assert.ok(compare({ ...DEFAULTS, pteIncome: x }).savings > 0);
  assert.ok(compare({ ...DEFAULTS, pteIncome: x - 5000 }).savings <= 0.5);
});

test("first paying income is null when the entity gets no federal benefit", () => {
  assert.equal(firstPayingIncome({ ...DEFAULTS, fedRatePct: 0 }), null);
});

test("garbage inputs are treated as zero, never NaN", () => {
  const c = compare({ ...DEFAULTS, pteIncome: NaN, otherIncome: -5, pteRatePct: "x" });
  assert.ok(Number.isFinite(c.savings));
});

test("money formats", () => {
  assert.equal(money(-1680), "-$1,680");
});
