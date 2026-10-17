import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, standardFee, lineResult, fixedCosts, breakEven, associate, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, LINES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the standard fee is the base fee plus the per-square-foot rate on the area above the threshold only", () => {
  // $375 + (2,000 - 1,500) x $0.15 = $450
  assert.equal(standardFee(base()), 450);
  assert.equal(standardFee({ ...base(), avgSqft: 1200 }), 375);
  assert.equal(standardFee({ ...base(), avgSqft: 3500 }), 675);
});

test("weekly fixed cost spreads monthly insurance, software and other cost over 52/12 weeks and equipment over its years", () => {
  const f = fixedCosts(base());
  // $180 x 12 / 52 = $41.54; $120 x 12 / 52 = $27.69; $6,000 / 5 / 52 = $23.08; $150 x 12 / 52 = $34.62
  assert.equal(f.insurance, 41.54);
  assert.equal(f.software, 27.69);
  assert.equal(f.equipment, 23.08);
  assert.equal(f.other, 34.62);
  assert.equal(f.total, 126.92);
});

test("only completed trips earn fees; fallen-through bookings earn nothing but cost a share of their hours", () => {
  const r = plan(sampleInput());
  // 9 trips booked (8 standard + 1 re-inspection) at 10% fall-through = 8.1 completed
  assert.equal(r.season.booked, 9);
  assert.equal(r.season.completed, 8.1);
  // 7.2 x $450 + 1.8 x $150 + 2.7 x $150 + 1.8 x $100 + 0.9 x $175 = 3240 + 270 + 405 + 180 + 157.5
  assert.equal(r.season.revenue, 4252.5);
  // referral 4% of fees, mileage 8.1 trips x 40 mi x $0.70 = $226.80, direct 7.2x5 + 1.8x10 + 2.7x30 + 1.8x15 = $162
  assert.equal(r.season.referral, 170.1);
  assert.equal(r.season.mileage, 226.8);
  assert.equal(r.season.direct, 162);
  // fees lost to fall-through: 8x.1x450 + 2x.1x150 + 3x.1x150 + 2x.1x100 + 1x.1x175 = 360 + 30 + 45 + 20 + 17.5
  assert.equal(r.season.fallThroughLostFees, 472.5);
  assert.equal(r.season.fallThroughLostFeesYear, 24570);
  const zero = plan({ ...sampleInput(), fallThroughPct: "0" });
  assert.equal(zero.season.fallThroughLostFees, 0);
  assert.equal(zero.season.completed, 9);
  assert.ok(zero.season.hours < r.season.hours + 100 && zero.season.revenue > r.season.revenue);
});

test("hours add on-site, report, drive and the unrefillable hours of fallen-through bookings", () => {
  const r = plan(sampleInput());
  // standard trip 2.75 + 1.5 + 0.75 drive = 5h: 7.2 x 5 + 8 x .1 x .25 x 5 = 37; sewer 1.35 + .0375; radon .675 + .01875; WDO .9 + .025; re 0.9 x 2 + .05 = 1.85
  near(r.season.hours, 41.856, 0.06);
  near(r.season.ownerPay, 41.85625 * 45, 0.6);
  near(r.season.afterPay, r.season.net - r.season.ownerPay, 0.02);
});

test("a standard inspection costs the owner's loaded hours, mileage, direct cost, referral cost and its share of fixed cost", () => {
  const v = base();
  const std = lineResult(v, LINES[0]);
  // hours 5 x $45 x (1 + (.1/.9) x .25) = $231.25; + $28 mileage + $5 direct + $18 referral + $126.92/8.1 = $15.67
  assert.equal(std.labor, 231.25);
  assert.equal(std.mileage, 28);
  assert.equal(std.referral, 18);
  assert.equal(std.fixedShare, 15.67);
  assert.equal(std.cost, 297.92);
  assert.equal(std.profit, 152.08);
  // fee for a 35% margin with 4% referral: (231.25 + 28 + 5 + 15.67) / (1 - .35 - .04)
  assert.equal(std.targetFee, 458.88);
  // add-ons ride the same trip: no drive, no mileage, no fixed share
  const radon = lineResult(v, LINES[2]);
  assert.equal(radon.mileage, 0);
  assert.equal(radon.fixedShare, 0);
  assert.equal(radon.hours, 0.25);
});

test("an add-on's value per hour is its fee less referral and direct cost over its loaded hours", () => {
  const radon = lineResult(base(), LINES[2]);
  // ($150 - $6 - $30) / (0.25 x 1.02778) = $443.68
  assert.equal(radon.perHourAllIn, 443.68);
  const sewer = lineResult(base(), LINES[1]);
  assert.equal(sewer.perHourAllIn, 173.84);
  const r = plan(sampleInput());
  assert.ok(r.advice.some((a) => /Radon test add-on: \$150.00 for 0.25 extra hours/.test(a)));
});

test("a higher fall-through rate lowers weekly profit and raises the fee needed", () => {
  const lo = plan({ ...sampleInput(), fallThroughPct: "0" });
  const hi = plan({ ...sampleInput(), fallThroughPct: "25" });
  assert.ok(hi.season.afterPay < lo.season.afterPay);
  assert.ok(hi.season.lines[0].targetFee > lo.season.lines[0].targetFee);
});

test("break-even trips per month cover the fixed cost exactly at the current mix", () => {
  const v = base();
  const be = breakEven(v);
  // contribution per completed trip after the owner's pay, times break-even trips, equals the weekly fixed cost
  near(be.owner.completedWeek, fixedCosts(v).totalRaw / be.owner.contribution, 0.06);
  near(be.cash.completedWeek, fixedCosts(v).totalRaw / be.cash.contribution, 0.06);
  assert.ok(be.cash.completedWeek <= be.owner.completedWeek);
  near(be.owner.bookedMonth, (fixedCosts(v).totalRaw / be.owner.contribution / 0.9) * 52 / 12, 0.06);
  const dear = breakEven({ ...v, ownerRate: 400 });
  assert.equal(dear.owner, null);
});

test("associate: paid per completed inspection, owner reviews each report, fixed seat cost comes off", () => {
  const a = associate(base());
  // add-on and re-inspection revenue per standard: 2/8 x 150 + 3/8 x 150 + 2/8 x 100 + 1/8 x 175 = 37.5 + 56.25 + 25 + 21.875 = 140.625; bundle $590.63
  assert.equal(a.bundleRev, 590.63);
  // pay $220 + 40% x 140.625 = $276.25; review 0.75h x $45 = $33.75
  assert.equal(a.pay, 276.25);
  assert.equal(a.review, 33.75);
  // direct: 5 + .25x10 + .375x30 + .25x15 + 0 = 22.5; referral 4% x 590.625 = 23.625; 590.625 - 23.625 - 22.5 - 276.25 - 33.75 = 234.50
  assert.equal(a.perCompleted, 234.5);
  // 4 booked at 90% = 3.6 completed; fixed 150 x 12 / 52 = 34.62; 3.6 x 234.5 - 34.62 = 809.58
  assert.equal(a.completed, 3.6);
  assert.equal(a.added, 809.58);
  assert.equal(a.reviewHours, 2.7);
  assert.equal(associate(base(), 0).added, -34.62);
});

test("the most you can pay an associate keeps the target margin on the whole bundle", () => {
  const v = base();
  const a = associate(v);
  const at = associate({ ...v, assocPayStd: a.maxPayStd });
  // margin = (bundle - referral - direct - pay - review) / bundle should equal the 35% target
  near(at.perCompleted / at.bundleRev, 0.35, 0.0005);
});

test("a very high pay per inspection makes hiring lose money and says so through a negative addition", () => {
  const a = associate({ ...base(), assocPayStd: 700 });
  assert.ok(a.added < 0);
  assert.equal(a.breakEvenBooked, null);
});

test("plan compares solo with associate and keeps the two totals consistent", () => {
  const r = plan(sampleInput());
  near(r.season.withAssociateAfterPay - r.season.soloAfterPay, r.season.assoc.added, 0.02);
  assert.equal(r.table.length, 5);
  assert.equal(r.table[0].extra, 0);
  assert.ok(r.table[4].totalAfterPay > r.table[2].totalAfterPay);
  assert.ok(r.advice.length >= 8);
});

test("validation: bad input is refused with a reason, never computed", () => {
  const bad = (patch) => plan({ ...sampleInput(), ...patch }).error;
  assert.match(bad({ stdQty: "0" }), /standard inspections/);
  assert.match(bad({ stdQty: "2.5" }), /whole number/);
  assert.match(bad({ stdQty: "-1" }), /not negative/);
  assert.match(bad({ stdQty: "x" }), /plain number/);
  assert.match(bad({ radonQty: "9" }), /cannot exceed/);
  assert.match(bad({ fallThroughPct: "95" }), /at or below 90/);
  assert.match(bad({ wastedPct: "120" }), /at or below 100/);
  assert.match(bad({ referralPct: "70", targetMarginPct: "40" }), /together/);
  assert.match(bad({ equipmentYears: "0.1" }), /half a year/);
  assert.match(bad({ workHoursPerWeek: "0" }), /above 0/);
  assert.match(bad({ assocAddonPct: "130" }), /at or below 100/);
  assert.equal(bad({}), null);
});

test("defaults apply when optional fields are blank and the sample plans cleanly", () => {
  const r = plan({ stdQty: "5" });
  assert.equal(r.error, null);
  assert.equal(r.input.baseFee, 375);
  assert.ok(r.season.revenue > 0);
});

test("share link round-trips only known keys and drops everything else", () => {
  const s = encodeShare({ ...sampleInput(), evil: "<script>" });
  assert.ok(!s.includes("evil"));
  assert.deepEqual(decodeShare("#" + s), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&stdQty=" + "9".repeat(500)), { stdQty: "9".repeat(200) });
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});

test("CSV has a header and one row per associate volume", () => {
  const csv = toCsv(plan(sampleInput())).split("\n");
  assert.equal(csv.length, 6);
  assert.match(csv[0], /^extra_associate_inspections_booked,/);
  assert.equal(csv[3].split(",")[0], "4");
});
