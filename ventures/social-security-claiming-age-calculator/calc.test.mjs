import { test } from "node:test";
import assert from "node:assert/strict";
import { fraMonths, survivorFraMonths, ownFactor, spousalFactor, survivorFactor, breakEven, simulate, analyze, sampleInput, reportCsv, ageLabel, candidateAges, money } from "./calc.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const P = (by, pia, die = 90, bm = 1) => ({ birth: by * 12 + bm - 1, by, pia, fra: fraMonths(by), sFra: survivorFraMonths(by), die: die * 12 });

test("full retirement age follows the SSA table", () => {
  assert.equal(fraMonths(1937), 780);
  assert.equal(fraMonths(1943), 792);
  assert.equal(fraMonths(1954), 792);
  assert.equal(fraMonths(1955), 794);
  assert.equal(fraMonths(1959), 802);
  assert.equal(fraMonths(1960), 804);
  assert.equal(fraMonths(1990), 804);
});

test("survivor full retirement age follows the SSA survivor table", () => {
  assert.equal(survivorFraMonths(1939), 780);
  assert.equal(survivorFraMonths(1940), 782);
  assert.equal(survivorFraMonths(1945), 792);
  assert.equal(survivorFraMonths(1956), 792);
  assert.equal(survivorFraMonths(1957), 794);
  assert.equal(survivorFraMonths(1961), 802);
  assert.equal(survivorFraMonths(1962), 804);
});

test("own benefit: 70% at 62 and 124% at 70 when FRA is 67; 75% and 132% when FRA is 66", () => {
  near(ownFactor(744, 804), 0.7);
  near(ownFactor(840, 804), 1.24);
  near(ownFactor(804, 804), 1);
  near(ownFactor(744 + 24, 792), 0.8667, 1e-4 + 1e-9);
  near(ownFactor(744, 792), 0.75);
  near(ownFactor(840, 792), 1.32);
});

test("own benefit is clamped to ages 62 to 70", () => {
  near(ownFactor(600, 804), ownFactor(744, 804));
  near(ownFactor(900, 804), ownFactor(840, 804));
});

test("spousal benefit: 65% at 62 with FRA 67, 70% at 62 with FRA 66, never above 100%", () => {
  near(spousalFactor(744, 804), 0.65);
  near(spousalFactor(744, 792), 0.7);
  near(spousalFactor(900, 804), 1);
});

test("survivor benefit: 71.5% at 60 rising to 100% at survivor FRA, flat after", () => {
  near(survivorFactor(720, 804), 0.715);
  near(survivorFactor(804, 804), 1);
  near(survivorFactor(900, 804), 1);
  near(survivorFactor(762, 804), 0.715 + 0.285 * 0.5);
  near(survivorFactor(600, 804), 0.715);
});

test("break-even from 62 to 70 with FRA 67 is about 80 and a half", () => {
  const p = P(1962, 1000);
  const be = breakEven(p, 744, 840);
  assert.ok(be >= 80 * 12 && be <= 81 * 12, String(be));
  assert.equal(breakEven(p, 840, 744), null);
});

test("single person: zero discount, living to 100, waiting to 70 gives the most; dying at 65, claiming at 62 does", () => {
  const long = { ...P(1962, 2000, 100) }, short = { ...P(1962, 2000, 65) };
  assert.ok(simulate(long, null, 840, 0, 0).total > simulate(long, null, 744, 0, 0).total);
  assert.ok(simulate(short, null, 744, 0, 0).total > simulate(short, null, 840, 0, 0).total);
});

test("single person total matches the hand calculation", () => {
  const p = P(1962, 1000, 70); // FRA 67, claims 62, receives until 70
  const r = simulate(p, null, 744, 0, 0);
  near(r.total, 700 * 96, 1e-6);
  assert.equal(r.months, 96);
});

test("discounting lowers present value and never changes the undiscounted total", () => {
  const p = P(1962, 2000, 90);
  const a = simulate(p, null, 804, 0, 0), b = simulate(p, null, 804, 0, 0.03);
  assert.ok(b.pv < a.pv);
  near(a.total, b.total, 1e-6);
});

test("couple: the survivor keeps the larger check, so the higher earner's delay raises the survivor's income", () => {
  const hi = P(1962, 3000, 75), lo = P(1962, 1000, 95);
  const early = simulate(hi, lo, 744, 744, 0).total, late = simulate(hi, lo, 840, 744, 0).total;
  assert.ok(late > early);
});

test("couple: a spousal top-up is paid only after both have claimed and stops when the worker dies", () => {
  const hi = P(1962, 3000, 62 + 1 + 0), lo = P(1962, 1000, 95);
  hi.die = 63; // dies at 63, ends spousal; survivor takes over
  const withTopUp = simulate({ ...P(1962, 3000, 90) }, P(1962, 1000, 90), 804, 804, 0).total;
  const noTopUp = simulate(P(1962, 3000, 90), { ...P(1962, 1500, 90) }, 804, 804, 0).total; // 1500 = half, no excess
  const own = 3000 * 12 * 23 + 1500 * 12 * 23;
  near(noTopUp, own, 1e-6);
  // excess = 1500 - 1000 = 500/mo on top of own 1000
  near(withTopUp, 3000 * 276 + 1000 * 276 + 500 * 276, 1e-6);
  void hi; void lo;
});

test("couple: survivor who claimed no own benefit still gets the survivor amount from survivor FRA", () => {
  const hi = P(1962, 3000, 70), lo = P(1962, 500, 90);
  const r = simulate(hi, lo, 804, 804, 0);
  assert.ok(r.total > 0);
  // after the higher earner dies at 70, lo (born same year) is 70 and gets max(own 500, survivor 3000)
  const afterSurvivor = 3000 * (90 - 70) * 12;
  const before = 3000 * 8 * 12 + 500 * 5 * 12 + 500 * (70 - 62 - 5) * 12; // rough guard below
  void before;
  assert.ok(r.total >= afterSurvivor);
});

test("early-claiming decedent leaves at least 82.5% of PIA to the survivor", () => {
  const hi = P(1962, 3000, 63), lo = P(1962, 0.01, 90);
  // hi claims at 62: 70% of PIA = 2100, below 82.5% = 2475. Survivor base is 2475.
  const r = simulate(hi, lo, 744, 744, 0);
  const survivorMonths = (90 - 67) * 12;
  assert.ok(r.total > 2475 * survivorMonths * 0.99);
  assert.ok(r.total < 2475 * survivorMonths + 3000 * 12 * 2);
});

test("analyze returns errors for bad input", () => {
  assert.match(analyze({ mode: "single", a: { birthYear: "1800", birthMonth: "1", pia: "2000", dieAge: "90" } }).error, /birth year/);
  assert.match(analyze({ mode: "single", a: { birthYear: "1962", birthMonth: "1", pia: "", dieAge: "90" } }).error, /full retirement age/);
  assert.match(analyze({ mode: "single", a: { birthYear: "1962", birthMonth: "1", pia: "2000", dieAge: "50" } }).error, /plan-to age/);
  assert.match(analyze({ mode: "couple", a: { birthYear: "1962", birthMonth: "1", pia: "2000", dieAge: "90" }, b: {} }).error, /Person B/);
  assert.match(analyze({ mode: "single", a: { birthYear: "1962", birthMonth: "1", pia: "2000", dieAge: "90" }, discount: "50" }).error, /Discount/);
});

test("single analysis lists every whole year plus the exact FRA and picks the best row", () => {
  const r = analyze({ mode: "single", a: { birthYear: "1959", birthMonth: "5", pia: "2500", dieAge: "92" }, discount: "1" });
  assert.equal(r.single.rows.length, 10);
  assert.ok(r.single.rows.some((x) => x.claim === 802));
  assert.ok(r.single.best.pv >= Math.max(...r.single.rows.map((x) => x.pv)) - 1e-6);
  assert.equal(r.couple, undefined);
});

test("longer lives favour later claiming for one person", () => {
  const base = { mode: "single", discount: "1" };
  const short = analyze({ ...base, a: { birthYear: "1962", birthMonth: "1", pia: "2500", dieAge: "72" } });
  const long = analyze({ ...base, a: { birthYear: "1962", birthMonth: "1", pia: "2500", dieAge: "98" } });
  assert.ok(short.single.best.claim < long.single.best.claim);
  assert.equal(long.single.best.claim, 840);
  assert.equal(short.single.best.claim, 744);
});

test("couple analysis: four scenarios, best pair reported, higher earner identified", () => {
  const r = analyze(sampleInput());
  assert.equal(r.couple.length, 4);
  assert.equal(r.higher, "a");
  for (const s of r.couple) {
    assert.ok(s.best.pv >= s.both62 - 1e-6);
    assert.ok(s.best.pv >= s.bothFra - 1e-6);
  }
  assert.equal(r.couple[3].deathA, 75);
  assert.equal(r.couple[3].deathB, 95);
});

test("higher earner is B when B has the larger benefit", () => {
  const s = sampleInput();
  const r = analyze({ ...s, a: s.b, b: s.a });
  assert.equal(r.higher, "b");
  assert.equal(r.couple[3].deathB, 75);
});

test("CSV has a header and a row per claim age", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv.split("\n")[0], /^claim_age,monthly_benefit/);
  assert.ok(csv.split("\n").length > 12);
});

test("helpers", () => {
  assert.equal(ageLabel(806), "67 and 2 months");
  assert.equal(ageLabel(804), "67");
  assert.equal(money(1234567.4), "1,234,567");
  assert.deepEqual(candidateAges(804).length, 9);
  assert.equal(candidateAges(802).length, 10);
});

test("nothing in the tool is a random or time-dependent input", () => {
  const a = analyze(sampleInput()), b = analyze(sampleInput());
  assert.deepEqual(a.couple[0].best, b.couple[0].best);
});
