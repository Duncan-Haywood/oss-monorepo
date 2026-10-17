import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, policy, serviceLine, fixedCosts, studioModes, breakEven, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = (o = {}) => readInput({ ...sampleInput(), ...o }).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("fixed cost is rent, instruments spread over their years, other costs and recital cost, less recital fees collected", () => {
  const f = fixedCosts(base());
  // rent 400 x 12 = 4800; 3000 / 10 = 300; 80 x 12 = 960; recital 600; fees 400
  assert.equal(f.rent, 4800);
  assert.equal(f.equipment, 300);
  assert.equal(f.other, 960);
  assert.equal(f.total, 6660);
  assert.equal(f.net, 6260);
});

test("cancellation policy splits cancelled lessons into charged, made up and lost", () => {
  const p = policy(base());
  // 8% cancel: 25% charged, 50% of the rest made up -> lost .08 x .75 x .5 = .03, made up .03
  near(p.lost, 0.03, 1e-9);
  near(p.makeup, 0.03, 1e-9);
  near(p.tf, 0.95, 1e-9);
  near(p.paid, 0.97, 1e-9);
  const strict = policy(base({ chargedPct: "100", makeupPct: "0" }));
  assert.equal(strict.lost, 0);
  const lax = policy(base({ chargedPct: "0", makeupPct: "0" }));
  near(lax.lost, 0.08, 1e-9);
});

test("weekly hours count teaching, unpaid prep, in-home travel and admin", () => {
  const m = studioModes(base());
  // taught lessons: 8 x .95 = 7.6 short, 9.5 long, 1.9 group. teach+prep hours: 7.6 x 40/60 + 9.5 x 75/60 + 1.9 x 90/60 = 5.0667 + 11.875 + 2.85
  near(m.w.teachH, 19.7917, 0.001);
  // travel: 20% of the 17.1 taught private lessons x 40 min
  near(m.w.travelH, 17.1 * 0.2 * 40 / 60, 0.001);
  assert.equal(m.w.adminH, 3);
  near(m.w.hours, m.w.teachH + m.w.travelH + 3, 1e-9);
});

test("tuition is earned over billed weeks, hours over taught weeks, so unbilled teaching weeks lower the hourly rate", () => {
  const a = plan(sampleInput()).season;
  const same = plan({ ...sampleInput(), weeksBilled: "40" }).season;
  assert.ok(same.effectiveHourly > a.effectiveHourly);
  near(same.revenueYear / a.revenueYear, 40 / 36, 1e-6);
  assert.equal(a.gapWeeks, 4);
  assert.equal(same.gapWeeks, 0);
  near(a.gapCost, 4 * (a.revenueYear / 36), 0.02);
});

test("effective hourly rate is the private net over the year's working hours", () => {
  const r = plan(sampleInput()).season;
  near(r.effectiveHourly, r.privateNet / r.hoursPerYear, 0.01);
  // revenue 36316.80 + recital fees 400 - materials/mileage - fixed 6660
  assert.equal(r.revenueYear, 36316.8);
  assert.ok(r.effectiveHourly < 40);
  assert.ok(r.effectiveHourly > 20);
});

test("the price needed for the target hourly gives exactly that hourly when every price is raised to it", () => {
  const v = base();
  const m = studioModes(v);
  const lines = SERVICES.map((s) => serviceLine(v, s, m));
  const raised = {};
  for (const l of lines) raised[l.id + "Price"] = String(l.targetPrice);
  const r = plan({ ...sampleInput(), ...raised }).season;
  near(r.effectiveHourly, 40, 0.1);
});

test("cancellation cost is lost tuition plus make-up time at the target hourly, and is zero under a full-charge policy", () => {
  const r = plan(sampleInput()).season;
  // lost lessons: 20 x .03 = .6 a week; prices 35/60/80 weighted: 8 x .03 x 35 + 10 x .03 x 60 + 2 x .03 x 80 = 8.4 + 18 + 4.8 = 31.2 a week x 36 weeks
  assert.equal(r.cancelRevenueYear, 1123.2);
  assert.ok(r.makeupTimeYear > 0);
  assert.equal(r.cancelCostYear, round(r.cancelRevenueYear + r.makeupTimeYear));
  const none = plan({ ...sampleInput(), chargedPct: "100", makeupPct: "0" }).season;
  assert.equal(none.cancelCostYear, 0);
  const worse = plan({ ...sampleInput(), cancelPct: "20" }).season;
  assert.ok(worse.cancelCostYear > r.cancelCostYear);
});
const round = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

test("a music school split pays you a share of tuition, with no rent, travel or recital cost, and the equal split matches private hourly", () => {
  const r = plan(sampleInput()).season;
  const m = studioModes(base());
  // school pays for .96 of each booked lesson (92% taught + half the 8% cancelled): 268.80 + 576 + 153.60 = $998.40 a week x 36 weeks x 50%, less materials $34.96 x 40 weeks and $300 of instruments
  near(m.school.gross, 35942.4, 0.01);
  near(m.school.net, 16272.8, 0.01);
  const eq = plan({ ...sampleInput(), schoolPct: String(r.equalSplit) }).season;
  near(eq.schoolHourly, r.effectiveHourly, 0.05);
  const higher = plan({ ...sampleInput(), schoolPct: "70" }).season;
  assert.ok(higher.schoolNet > r.schoolNet);
});

test("renting a room costs the hourly rate on booked studio lesson hours and drops your own rent; the equal rate matches private net", () => {
  const r = plan(sampleInput()).season;
  const m = studioModes(base());
  // booked studio minutes: short 8 x 30 x .8 + long 10 x 60 x .8 + group 2 x 60 = 192 + 480 + 120 = 792 min = 13.2 h a week x 40 weeks = 528 h x $18
  assert.equal(r.roomCost, 9504);
  near(m.a.studioBookedHours, 528, 0.001);
  const eq = plan({ ...sampleInput(), roomHourly: String(r.equalRoomRate) }).season;
  near(eq.roomNet, r.privateNet, 1);
  const free = plan({ ...sampleInput(), roomHourly: "0" }).season;
  assert.ok(free.roomNet > r.privateNet);
});

test("in-home lessons add travel time and mileage and take no room hours", () => {
  const away = plan({ ...sampleInput(), inHomePct: "100" }).season;
  const home = plan({ ...sampleInput(), inHomePct: "0" }).season;
  assert.ok(away.travelHoursPerWeek > 0);
  assert.equal(home.travelHoursPerWeek, 0);
  assert.ok(away.effectiveHourly < home.effectiveHourly);
  assert.ok(away.roomCost < home.roomCost);
});

test("break-even lessons cover fixed cost first, then fixed cost plus the target hourly", () => {
  const be = breakEven(base({ shortPrice: "60", longPrice: "100", groupPrice: "150", targetHourly: "30" }));
  assert.ok(be.cover > 0);
  assert.ok(be.target === null || be.target > be.cover);
  const lowTarget = breakEven(base({ shortPrice: "60", longPrice: "100", groupPrice: "150", targetHourly: "10" }));
  assert.ok(lowTarget.target !== null);
  assert.equal(breakEven(base()).target, null);
});

test("headline price per lesson hour overstates the effective hourly", () => {
  const v = base();
  const m = studioModes(v);
  for (const s of SERVICES) {
    const l = serviceLine(v, s, m);
    assert.ok(l.effectiveHourly < l.headlineHourly);
  }
});

test("volume table covers 50 to 150 percent and the CSV has one row each", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(toCsv(r).split("\n").length, 6);
  assert.ok(r.table[4].private > r.table[0].private);
});

test("validation rejects nonsense with a named field", () => {
  for (const bad of [{ shortQty: "1.5" }, { shortQty: "-1" }, { shortPrice: "abc" }, { cancelPct: "95" }, { chargedPct: "60", makeupPct: "50" }, { weeksTaught: "0" }, { weeksTaught: "60" }, { weeksBilled: "60" }, { inHomePct: "120" }, { equipmentYears: "0" }, { schoolPct: "120" }, { shortQty: "0", longQty: "0", groupQty: "0" }, { shortMin: "0" }]) {
    const r = plan({ ...sampleInput(), ...bad });
    assert.ok(r.error, JSON.stringify(bad));
  }
  assert.equal(plan(sampleInput()).error, null);
});

test("advice names the three ways to run the studio and the cancellation cost", () => {
  const text = plan(sampleInput()).advice.join("\n");
  assert.match(text, /teach privately/);
  assert.match(text, /music school/);
  assert.match(text, /rent a room/);
  assert.match(text, /Cancellations/);
});

test("share link round trips only known keys", () => {
  const input = sampleInput();
  assert.deepEqual(decodeShare(encodeShare(input)), input);
  assert.deepEqual(decodeShare("#evil=1&shortQty=3"), { shortQty: "3" });
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});
