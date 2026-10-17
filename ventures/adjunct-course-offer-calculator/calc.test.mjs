import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFER_DEFAULTS, DEFAULTS, num, money, pct, courseEconomics, payForTarget, maxStudents, enrolmentLadder, analyzeOffer, compare, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: 10 weeks, 3 h class, 2 h prep, 10 students x 6 min = 1 h grading, nothing else.
const plain = { ...OFFER_DEFAULTS, pay: 3000, weeks: 10, classHours: 3, prepHours: 2, students: 10, gradeMin: 6, officeHours: 0, emailHours: 0,
  unpaidHours: 0, commuteMin: 0, trips: 0, tripCost: 0, fees: 0, cancelPct: 0, killFee: 0 };

test("hours add class, prep, grading that scales with students, and unpaid time", () => {
  const e = courseEconomics({ ...plain, officeHours: 1, emailHours: 1, unpaidHours: 8 });
  near(e.grading, 1);
  near(e.weeklyWork, 3 + 2 + 1 + 1 + 1);
  near(e.workHours, 10 * 8 + 8);
  near(e.hourly, 3000 / 88);
});

test("the contract rate counts only hours in the room", () => {
  const e = courseEconomics(plain);
  near(e.quotedHourly, 100);          // 3000 / (10 x 3)
  near(e.hourly, 3000 / 60);          // 10 x 6 hours
});

test("commute adds time and driving costs reduce pay", () => {
  const e = courseEconomics({ ...plain, commuteMin: 60, trips: 2, tripCost: 10, fees: 100 });
  near(e.commuteHours, 20);
  near(e.direct, 300);
  near(e.net, 2700);
  near(e.allHours, 80);
  near(e.hourly, 2700 / 80);
  near(e.hourlyWork, 2700 / 60);
});

test("cancellation risk lowers expected pay and a kill fee softens it", () => {
  near(courseEconomics({ ...plain, cancelPct: 20 }).expectedPay, 2400);
  near(courseEconomics({ ...plain, cancelPct: 20, killFee: 500 }).expectedPay, 2500);
});

test("pay needed for a target is the pay that makes the hourly equal the target", () => {
  const o = { ...plain, commuteMin: 30, trips: 2, tripCost: 8, fees: 50, cancelPct: 10, killFee: 200 };
  const need = payForTarget(o, 40);
  near(courseEconomics({ ...o, pay: need }).hourly, 40, 1e-6);
});

test("max students is the class size where the hourly equals the target", () => {
  const o = { ...plain, pay: 4000 };
  const n = maxStudents(o, 40);
  assert.ok(courseEconomics(o, n).hourly >= 40);
  assert.ok(courseEconomics(o, n + 1).hourly < 40);
});

test("max students is null when even an empty class misses the target, infinite with no grading", () => {
  assert.equal(maxStudents({ ...plain, pay: 500 }, 40), null);
  assert.equal(maxStudents({ ...plain, gradeMin: 0 }, 10), Infinity);
});

test("a bigger class always pays less per hour when grading takes time", () => {
  const l = enrolmentLadder(plain);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].hourly < l[i - 1].hourly);
});

test("annual figures scale by courses per term and terms", () => {
  const a = analyzeOffer(plain, { ...DEFAULTS, coursesPerTerm: 3, termsPerYear: 2 });
  near(a.annual.courses, 6);
  near(a.annual.net, 6 * 3000);
});

test("warnings: below minimum wage, below target, negative net, inflated contract rate", () => {
  const low = analyzeOffer({ ...plain, pay: 400 }, { ...DEFAULTS, minWage: 7.25, targetHourly: 30 });
  assert.ok(low.warnings.some((w) => /below the .*minimum wage/.test(w)));
  const mid = analyzeOffer({ ...plain, pay: 3000 }, { ...DEFAULTS, minWage: 7.25, targetHourly: 80 });
  assert.ok(mid.warnings.some((w) => /against your/.test(w)));
  const neg = analyzeOffer({ ...plain, pay: 300, trips: 10, tripCost: 20 }, DEFAULTS);
  assert.ok(neg.warnings.some((w) => /cost more than the expected pay/.test(w)));
  const infl = analyzeOffer({ ...plain, pay: 3000, prepHours: 20 }, { ...DEFAULTS, targetHourly: 1 });
  assert.ok(infl.warnings.some((w) => /more than three times/.test(w)));
});

test("bad input is reported rather than computed", () => {
  assert.ok(analyzeOffer({ ...plain, weeks: 0 }).warnings.length);
  assert.equal(analyzeOffer({ ...plain, weeks: 0 }).e, null);
  assert.ok(analyzeOffer({ ...plain, cancelPct: 100 }).warnings.some((w) => /under 100/.test(w)));
  assert.ok(analyzeOffer({ ...plain, pay: -5 }).warnings.length);
});

test("compare ranks offers by effective hourly and skips blank offers", () => {
  const cmp = compare([
    { name: "State U", ...plain, pay: 3000 },
    { name: "Community College", ...plain, pay: 5000 },
    { pay: "" },
  ], {});
  assert.equal(cmp.rows.length, 2);
  assert.equal(cmp.best.name, "Community College");
  assert.deepEqual(cmp.ranked.map((r) => r.name), ["Community College", "State U"]);
});

test("a cheaper contract can beat a richer one once the drive is counted", () => {
  const cmp = compare([
    { name: "Far campus", ...plain, pay: 4000, commuteMin: 120, trips: 3, tripCost: 25 },
    { name: "Online", ...plain, pay: 3200, commuteMin: 0, trips: 0, tripCost: 0 },
  ], {});
  assert.equal(cmp.best.name, "Online");
});

test("num parses typed money and the format helpers round", () => {
  assert.equal(num("$3,000"), 3000);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(1234.6), "$1,235");
  assert.equal(pct(12.34), "12.3%");
});

test("CSV has one row per ranked offer and quotes names", () => {
  const cmp = compare([{ name: 'A "x", Co', ...plain }], {});
  const lines = toCsv(cmp).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"A ""x"", Co",3000\.00/);
  assert.equal(toCsv(compare([], {})), "");
});

test("defaults produce a sensible, finite example", () => {
  const a = analyzeOffer(OFFER_DEFAULTS, DEFAULTS);
  assert.ok(Number.isFinite(a.e.hourly) && a.e.hourly > 0);
  assert.ok(a.e.hourly < a.e.quotedHourly);
});
