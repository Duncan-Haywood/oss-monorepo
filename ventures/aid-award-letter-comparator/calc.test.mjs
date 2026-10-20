import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColleges, priceCollege, compareColleges, extraGrantToMatch, normaliseSettings, yearlyCsv, SAMPLE, money } from "./calc.mjs";

const FLAT = { years: 1, inflation: 0, feeSub: 0, feeUnsub: 0, feePlus: 0, feePriv: 0, graceYears: 0 };
const college = (o = {}) => ({ name: "X", tuition: 10000, housing: 0, books: 0, grants: 0, oneTime: 0, workStudy: 0, sub: 0, unsub: 0, plus: 0, priv: 0, ...o });
const pmt = (b, apr, yrs) => { const r = apr / 1200, n = yrs * 12; return (b * r) / (1 - Math.pow(1 + r, -n)); };

test("only grants cut the price; loans and work-study do not", () => {
  const r = priceCollege(college({ grants: 2000, sub: 3500, workStudy: 1000 }), FLAT);
  assert.equal(r.rows[0].netPrice, 8000);
  assert.equal(r.rows[0].cash, 3500);               // 8000 - 3500 loan - 1000 work-study
  assert.equal(r.gift, 2000);
});

test("subsidized loans do not accrue interest in school; payment matches the annuity formula", () => {
  const r = priceCollege(college({ sub: 3500 }), FLAT);
  assert.equal(r.balance, 3500);
  const p = pmt(3500, 6.39, 10);
  assert.ok(Math.abs(r.studentMonthly - p) < 1e-9);
  assert.ok(Math.abs(r.totalCost - (6500 + p * 120)) < 1e-6);
  assert.ok(Math.abs(r.interest - (p * 120 - 3500)) < 1e-6);
});

test("unsubsidized loans accrue simple interest through school and grace", () => {
  const s = { ...FLAT, years: 2, graceYears: 0.5, repeat: true };
  const r = priceCollege(college({ unsub: 1000 }), s);
  // year 1 accrues 2.5 years, year 2 accrues 1.5 years, at 6.39%
  const expected = 1000 * (1 + 0.0639 * 2.5) + 1000 * (1 + 0.0639 * 1.5);
  assert.ok(Math.abs(r.balance - expected) < 1e-9);
});

test("origination fees are paid in cash, not borrowed", () => {
  const r = priceCollege(college({ plus: 1000 }), { ...FLAT, feePlus: 4 });
  assert.equal(r.rows[0].fees, 40);
  assert.equal(r.rows[0].cash, 9000 + 40);
});

test("a first-year-only grant makes years 2+ dearer and is flagged", () => {
  const r = priceCollege(college({ grants: 1000, oneTime: 5000 }), { ...FLAT, years: 4 });
  assert.equal(r.rows[0].netPrice, 4000);
  assert.equal(r.rows[1].netPrice, 9000);
  assert.equal(r.year1Net, 4000);
  assert.equal(r.laterNet, 9000);
  assert.ok(r.flags.some((f) => /first-year only/.test(f)));
});

test("costs grow by the inflation setting", () => {
  const r = priceCollege(college(), { ...FLAT, years: 3, inflation: 10 });
  assert.deepEqual(r.rows.map((y) => Math.round(y.coa)), [10000, 11000, 12100]);
});

test("repeat off keeps loans and work-study to year 1", () => {
  const r = priceCollege(college({ sub: 3000, workStudy: 500 }), { ...FLAT, years: 3, repeat: false });
  assert.deepEqual(r.rows.map((y) => y.loans), [3000, 0, 0]);
  assert.deepEqual(r.rows.map((y) => y.workStudy), [500, 0, 0]);
});

test("borrowing beyond the bill, the federal limit, a heavy work-study load and a payment/salary squeeze are flagged", () => {
  const r = priceCollege(college({ tuition: 5000, sub: 4000, unsub: 4000, workStudy: 6000 }), { ...FLAT, salary: 10000 });
  const text = r.flags.join("\n");
  assert.match(text, /above the \$5,500 federal limit/);
  assert.match(text, /more than the bill/);
  assert.match(text, /hours a week/);
  assert.match(text, /10% rule of thumb/);
});

test("compare ranks by total cost to the family, not by sticker price", () => {
  const cheapSticker = college({ name: "Cheap sticker", tuition: 20000, grants: 0, priv: 8000 });
  const dearSticker = college({ name: "Dear sticker", tuition: 40000, grants: 30000 });
  const out = compareColleges([cheapSticker, dearSticker], { ...FLAT, years: 4 });
  assert.equal(out[0].name, "Dear sticker");
  assert.equal(out[0].gap, 0);
  assert.ok(out[1].gap > 0);
  assert.ok(out[1].matchGrant > 0);
});

test("the grant needed to match really does close the gap", () => {
  const a = college({ name: "A", tuition: 30000, sub: 3500, unsub: 2000 });
  const b = college({ name: "B", tuition: 20000, grants: 2000, sub: 3500, unsub: 2000 });
  const s = { ...FLAT, years: 4 };
  const best = priceCollege(b, s).totalCost;
  const g = extraGrantToMatch(a, s, best);
  assert.ok(g > 0);
  assert.ok(priceCollege(a, s, { extraGrant: g, trimLoans: true }).totalCost <= best + 1e-6);
  assert.ok(priceCollege(a, s, { extraGrant: g - 50, trimLoans: true }).totalCost > best - 1e-6);
});

test("the parser reads an award-letter block, synonyms, totals and warnings", () => {
  const { colleges, warnings } = parseColleges(`# comment
College: Alpha
Cost of attendance: $30,000
Merit scholarship: $5,000
One-time grant: 1000
Direct Unsubsidized Loan: 2,000
Direct Subsidized Loan: 3,500
Parent PLUS loan: 4000
Federal work-study: 1500
Mystery fee: 5

Beta U
Tuition: 9000
Room and board: 8000
Books: 1000
Grant: abc
`);
  assert.equal(colleges.length, 2);
  const a = colleges[0];
  assert.equal(a.tuition, 30000);
  assert.equal(a.grants, 5000);
  assert.equal(a.oneTime, 1000);
  assert.equal(a.unsub, 2000);
  assert.equal(a.sub, 3500);
  assert.equal(a.plus, 4000);
  assert.equal(a.workStudy, 1500);
  const b = colleges[1];
  assert.equal(b.name, "Beta U");
  assert.equal(b.housing, 8000);
  assert.equal(warnings.length, 2);
});

test("a block with no cost is skipped with a warning", () => {
  const { colleges, warnings } = parseColleges("College: Empty\nGrants: 100");
  assert.equal(colleges.length, 0);
  assert.match(warnings[0], /Empty/);
});

test("settings are clamped", () => {
  const s = normaliseSettings({ years: 99, termYears: 0, graceYears: 9, inflation: -3, repeat: false });
  assert.equal(s.years, 6);
  assert.equal(s.termYears, 1);
  assert.equal(s.graceYears, 2);
  assert.equal(s.inflation, 0);
  assert.equal(s.repeat, false);
});

test("the sample parses cleanly, ranks three offers, and exports a CSV", () => {
  const { colleges, warnings } = parseColleges(SAMPLE);
  assert.deepEqual(warnings, []);
  assert.equal(colleges.length, 3);
  const out = compareColleges(colleges, {});
  assert.deepEqual(out.map((r) => r.rank), [1, 2, 3]);
  assert.ok(out[0].totalCost <= out[1].totalCost && out[1].totalCost <= out[2].totalCost);
  const csv = yearlyCsv(out);
  assert.equal(csv.trim().split("\n").length, 1 + 3 * 4);
  assert.match(csv, /^college,year,/);
});

test("money formats", () => {
  assert.equal(money(1234567.4), "$1,234,567");
  assert.equal(money(-50), "-$50");
});
