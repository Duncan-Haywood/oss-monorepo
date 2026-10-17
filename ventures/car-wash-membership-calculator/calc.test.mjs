import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSegments, analyze, reportCsv, sampleSegments, money, money2, pct } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const segs = (t) => { const p = parseSegments(t); assert.ok(p.rows, p.error); return p.rows; };
// Hand-worked case, no card fee: plan $30, retail $15, $2 a wash.
// Light 50% x 1 wash, Heavy 50% x 9 washes -> average 5 washes, cost $10, margin $20.
const TWO = "Light,50,1\nHeavy,50,9";
const OPTS = { membershipPrice: 30, retailPrice: 15, costPerWash: 2, cardFeePct: 0, members: 100, retailWashesPerMonth: 500, overheadMonthly: 3000, churnPct: 5, signupCost: 20, cannibalPct: 50, priorVisits: 2, washesPerHour: 40, hoursPerDay: 10, daysPerMonth: 30, priceStep: 5 };

test("parses lines with header, tabs and skips", () => {
  const p = parseSegments("segment,share,washes\nLight,40,1\nTypical\t60\t3\nbad\nNeg,-5,2\nOver,150,2\nX,10,-1");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Light", share: 40, washes: 1 });
  assert.deepEqual(p.rows[1], { name: "Typical", share: 60, washes: 3 });
  assert.match(p.warnings.join(" "), /4 line/);
  assert.ok(parseSegments("").error);
});

test("member margin, break-even washes and segment results match hand math", () => {
  const r = analyze(segs(TWO), OPTS);
  near(r.member.avgWashes, 5);
  near(r.member.cost, 10);
  near(r.member.margin, 20);
  near(r.member.breakEvenWashes, 15);
  assert.equal(r.segments[1].margin, 12);
  near(r.segments[1].retailValue, 135);
  near(r.segments[1].impliedPerWash, 30 / 9, 1e-9);
  assert.equal(r.member.underwater, 0);
});

test("a heavy segment past break-even loses money and is flagged", () => {
  const r = analyze(segs("Light,50,1\nRoad warrior,50,20"), OPTS);
  assert.equal(r.segments[1].losesMoney, true);
  near(r.segments[1].margin, -10);
  near(r.member.underwater, 0.5);
  assert.match(r.warnings.join(" "), /lose money on the plan/);
});

test("store contribution, cannibalization and break-even members", () => {
  const r = analyze(segs(TWO), OPTS);
  near(r.store.memberContribution, 2000);
  near(r.store.retailContribution, 500 * 13); // $15 - $2
  near(r.store.net, 2000 + 6500 - 3000);
  near(r.store.converted, 50);
  near(r.store.lostRetail, 50 * 2 * 13);
  near(r.store.incremental, 2000 - 1300);
  near(r.store.breakEvenMembers, 0); // retail alone covers overhead
  const heavyOverhead = analyze(segs(TWO), { ...OPTS, overheadMonthly: 8500 });
  near(heavyOverhead.store.breakEvenMembers, 100); // (8500 - 6500) / 20
});

test("lifetime value and payback", () => {
  const r = analyze(segs(TWO), OPTS);
  near(r.member.lifetimeMonths, 20);
  near(r.member.lifetimeValue, 20 * 20 - 20);
  near(r.member.paybackMonths, 1);
  const none = analyze(segs(TWO), { ...OPTS, churnPct: 0 });
  assert.equal(none.member.lifetimeValue, null);
});

test("card fee reduces plan revenue", () => {
  const r = analyze(segs(TWO), { ...OPTS, cardFeePct: 10 });
  near(r.member.netPrice, 27);
  near(r.member.margin, 17);
  near(r.member.breakEvenWashes, 13.5);
});

test("capacity and utilization", () => {
  const r = analyze(segs(TWO), OPTS);
  near(r.store.capacity, 12000);
  near(r.store.demand, 1000);
  near(r.store.utilization, 1000 / 12000);
  near(r.store.maxMembers, (12000 - 500) / 5);
  const tight = analyze(segs(TWO), { ...OPTS, washesPerHour: 2 });
  assert.match(tight.warnings.join(" "), /do not fit/);
});

test("price table holds usage and finds members needed to keep contribution", () => {
  const r = analyze(segs(TWO), OPTS);
  assert.deepEqual(r.prices.map((p) => p.price), [20, 25, 30, 35, 40]);
  const up = r.prices.find((p) => p.price === 35);
  near(up.margin, 25);
  near(up.monthlyChange, 500);
  near(up.membersToHold, 80);
  near(up.memberChangePct, -0.2);
  const down = r.prices.find((p) => p.price === 25);
  near(down.membersToHold, 2000 / 15);
  const bottom = r.prices.find((p) => p.price === 20);
  near(bottom.margin, 10);
  const loser = analyze(segs(TWO), { ...OPTS, priceStep: 10 });
  assert.equal(loser.prices.find((p) => p.price === 10).membersToHold, null);
});

test("shares that do not add to 100 are scaled with a warning", () => {
  const r = analyze(segs("A,30,2\nB,30,4"), OPTS);
  near(r.member.avgWashes, 3);
  assert.match(r.warnings.join(" "), /scaled to 100%/);
});

test("rejects bad inputs", () => {
  const s = segs(TWO);
  assert.ok(analyze(s, { ...OPTS, membershipPrice: 0 }).error);
  assert.ok(analyze(s, { ...OPTS, cardFeePct: 100 }).error);
  assert.ok(analyze(s, { ...OPTS, churnPct: 101 }).error);
  assert.ok(analyze(s, { ...OPTS, cannibalPct: 120 }).error);
  assert.ok(analyze(s, { ...OPTS, washesPerHour: 0 }).error);
  assert.ok(analyze(s, { ...OPTS, daysPerMonth: 40 }).error);
  assert.ok(analyze(s, { ...OPTS, members: "abc" }).error);
  assert.ok(analyze(s, { ...OPTS, costPerWash: -1 }).error);
});

test("zero cost per wash warns and has no break-even washes", () => {
  const r = analyze(segs(TWO), { ...OPTS, costPerWash: 0 });
  assert.equal(r.member.breakEvenWashes, null);
  assert.match(r.warnings.join(" "), /Cost per wash is zero/);
});

test("sample parses, runs and exports CSV", () => {
  const r = analyze(segs(sampleSegments()), {});
  assert.ok(Number.isFinite(r.member.margin));
  const csv = reportCsv(r);
  assert.match(csv, /^Segment,Share %/);
  assert.match(csv, /Break-even washes/);
  assert.equal(csv.endsWith("\n"), true);
});

test("formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
  assert.equal(pct(0.256, 0), "26%");
});
