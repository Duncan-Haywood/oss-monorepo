import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, employeeFica, selfEmploymentTax, fteCash, breakEvenRate, analyze } from "./calc.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b}, got ${a}`);
const bare = { salary: 100000, bonusPct: 0, equity: 0, matchPct: 0, employerHealth: 0, ptoDays: 0, holidays: 0,
  hoursPerWeek: 40, benchWeeks: 0, expenses: 0, offeredRate: 0, ssRate: 6.2, medicareRate: 1.45, wageBase: 184500 };

test("num strips symbols and rejects blanks", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
});

test("employee FICA on $100,000 is 6.2% + 1.45% = $7,650", () => {
  assert.equal(employeeFica(100000, bare), 7650);
});

test("employee FICA stops Social Security at the wage base", () => {
  // 184,500 * 6.2% = 11,439 ; 250,000 * 1.45% = 3,625
  close(employeeFica(250000, bare), 11439 + 3625, 0.01);
});

test("self-employment tax on $100,000 is 15.3% of 92.35% = $14,129.55", () => {
  close(selfEmploymentTax(100000, bare), 14129.55, 0.01);
});

test("self-employment tax caps Social Security on 92.35% of earnings", () => {
  // base 230,875 -> 184,500*12.4% = 22,878 ; 230,875*2.9% = 6,695.375
  close(selfEmploymentTax(250000, bare), 22878 + 6695.375, 0.01);
});

test("hand-worked: $100k salary, nothing else, break-even revenue is $107,546", () => {
  // cash to match = 100,000 - 7,650 = 92,350 ; revenue * (1 - 0.9235*0.153) = 92,350
  const b = breakEvenRate(bare);
  close(fteCash(bare), 92350, 0.001);
  close(b.revenue, 92350 / (1 - 0.9235 * 0.153), 0.5);
  close(b.revenue, 107546, 2);
  close(b.rate, b.revenue / 2080, 0.001);
});

test("the naive rate is salary over 2080 hours", () => {
  close(analyze(bare).naive, 100000 / 2080, 1e-9);
});

test("each gap only ever raises the rate", () => {
  const { steps } = analyze(DEFAULTS);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].rate >= steps[i - 1].rate - 1e-9, steps[i].label);
  assert.ok(steps[steps.length - 1].rate > steps[0].rate * 1.2);
});

test("unpaid time off: 24 days off at 5 days a week is 4.8 weeks", () => {
  const b = breakEvenRate({ ...bare, ptoDays: 15, holidays: 9 }, { tax: false });
  close(b.weeks, 52 - 4.8, 1e-9);
  close(b.rate, 100000 / (40 * 47.2), 1e-6);
});

test("health, match and expenses are added dollar for dollar before tax gross-up", () => {
  const o = { ...bare, employerHealth: 10000, matchPct: 5, expenses: 3000 };
  const b = breakEvenRate(o, { tax: false });
  close(b.revenue, 100000 + 10000 + 5000 + 3000, 0.01);
});

test("an offered rate below break-even shows a negative difference and a rate shortfall", () => {
  const a = analyze({ ...bare, offeredRate: 40 });
  assert.ok(a.offer.diff < 0);
  assert.ok(a.offer.shortfallRate > 0);
  const b = analyze({ ...bare, offeredRate: 80 });
  assert.ok(b.offer.diff > 0);
  assert.equal(b.offer.shortfallRate, 0);
});

test("an offer equal to break-even leaves a zero difference", () => {
  const be = breakEvenRate(bare).rate;
  close(analyze({ ...bare, offeredRate: be }).offer.diff, 0, 0.5);
});

test("a blank offered rate skips the comparison", () => {
  assert.equal(analyze({ ...bare, offeredRate: 0 }).offer, null);
});

test("garbage inputs never produce NaN", () => {
  const a = analyze({ ...DEFAULTS, salary: NaN, hoursPerWeek: -3, benchWeeks: "x" });
  assert.ok(Number.isFinite(a.breakEven.rate));
});
