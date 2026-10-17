import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, studio, perVisit, memberChoices, breakEvenUnlimited, unlimitedPriceSteps, optimizeUnlimitedPrice, emptySeatValue, attendanceSteps } from "./calc.mjs";

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("num parses money text and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("worked month: classes, seats, visits and profit by hand", () => {
  const r = studio(DEFAULTS);
  const classes = 30 * 52 / 12; // 130
  near(r.classes, classes);
  near(r.seats, classes * 14);
  const wanted = 95 * 9 + 40 * 10 * 0.88 + 160; // 855 + 352 + 160
  near(r.wanted, wanted);
  near(r.fillRate, wanted / (classes * 14));
  const revenue = 95 * 159 + 40 * 190 + 160 * 26;
  near(r.revenue, revenue);
  near(r.profit, revenue * 0.97 - classes * 55 - (6200 + 1800 + 900), 0.5);
  assert.equal(r.turnedAway, 0);
});

test("a full room seats only what fits and scales pack and drop-in revenue, not the unlimited fee", () => {
  const r = studio(DEFAULTS, { classesPerWeek: 8 });
  assert.ok(r.wanted > r.seats);
  near(r.seated, r.seats);
  near(r.fillRate, 1);
  near(r.unlRev, 95 * 159);
  const f = r.seats / r.wanted;
  near(r.dropRev, 160 * 26 * f);
  near(r.packRev, 40 * 190 * f);
  assert.ok(r.turnedAway > 0);
});

test("per-visit value: unlimited, pack with breakage, drop-in", () => {
  const v = perVisit(DEFAULTS);
  near(v.unlimited, (159 / 9) * 0.97);
  near(v.pack, (190 / 8.8) * 0.97);
  near(v.dropIn, 26 * 0.97);
  near(v.packSticker, 19);
});

test("higher pack breakage raises what each used class earns", () => {
  assert.ok(perVisit({ ...DEFAULTS, packBreakagePct: 30 }).pack > perVisit(DEFAULTS).pack);
});

test("member choices: crossovers and cheapest plan", () => {
  const m = memberChoices(DEFAULTS);
  near(m.unlimitedBeatsDropAt, 159 / 26);
  near(m.unlimitedBeatsPackAt, 159 / 19);
  assert.equal(m.rows.find((r) => r.visits === 2).best, "Class pack");
  assert.equal(m.rows.find((r) => r.visits === 16).best, "Unlimited");
});

test("break-even unlimited members is the first count with non-negative profit", () => {
  const u = breakEvenUnlimited(DEFAULTS);
  assert.ok(u !== null && u > 0);
  assert.ok(studio(DEFAULTS, { unlMembers: u }).profit >= 0);
  assert.ok(studio(DEFAULTS, { unlMembers: u - 1 }).profit < 0);
});

test("break-even is null when instructors can never be covered", () => {
  assert.equal(breakEvenUnlimited({ ...DEFAULTS, unlPrice: 0, packPrice: 0, dropPrice: 0 }, 50), null);
});

test("price steps: members fall as price rises and the best row is the maximum", () => {
  const rows = unlimitedPriceSteps(DEFAULTS);
  assert.ok(rows[0].members > rows[rows.length - 1].members);
  const o = optimizeUnlimitedPrice(DEFAULTS);
  assert.ok(o.rows.every((r) => r.profit <= o.best.profit + 1e-9));
  near(o.gain, o.best.profit - o.now.profit);
  near(o.now.profit, studio(DEFAULTS).profit, 0.01);
});

test("zero sensitivity makes a higher price always better", () => {
  const o = optimizeUnlimitedPrice({ ...DEFAULTS, priceSensitivity: 0 });
  assert.equal(o.best.mult, 1.4);
});

test("empty seats are worth drop-in net of the card fee", () => {
  const r = studio(DEFAULTS);
  const e = emptySeatValue(DEFAULTS, [10]);
  near(e[0].seats, r.emptySeats * 0.1);
  near(e[0].gain, r.emptySeats * 0.1 * 26 * 0.97);
});

test("attendance steps: more attendance, more profit until the room is full", () => {
  const a = attendanceSteps(DEFAULTS);
  assert.ok(a[1].profit < a[2].profit && a[2].profit < a[3].profit);
});

test("junk or empty inputs never produce NaN totals", () => {
  const r = studio({ ...DEFAULTS, classesPerWeek: NaN, capacity: -3, unlMembers: "x" });
  for (const k of ["revenue", "profit", "fillRate", "seated"]) assert.ok(Number.isFinite(r[k]), k);
});
