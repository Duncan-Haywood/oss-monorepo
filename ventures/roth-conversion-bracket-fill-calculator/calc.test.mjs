import { test } from "node:test";
import assert from "node:assert/strict";
import { rothConversion, incomeTax, taxableAt, BRACKETS, STANDARD_DEDUCTION } from "./calc.mjs";

test("single, $60,000 AGI: fills the 22% bracket exactly to $105,700 taxable", () => {
  const r = rothConversion({ filingStatus: "single", agi: 60000, targetRate: 0.22 });
  // taxable before = 60,000 - 16,100 = 43,900; room = 105,700 - 43,900 = 61,800
  assert.equal(r.taxableBefore, 43900);
  assert.equal(r.conversion, 61800);
  assert.equal(r.taxableAfter, 105700);
  // tax on 105,700 minus tax on 43,900
  const expected = incomeTax(105700, "single") - incomeTax(43900, "single");
  assert.equal(r.conversionTax, Math.round(expected * 100) / 100);
});

test("income tax at a known point: single $50,400 taxable", () => {
  // 12,400*10% + 38,000*12% = 1,240 + 4,560
  assert.equal(incomeTax(50400, "single"), 5800);
});

test("married joint uses joint deduction and brackets", () => {
  const r = rothConversion({ filingStatus: "mfj", agi: 40000, targetRate: 0.12 });
  assert.equal(r.taxableBefore, 40000 - 32200);
  assert.equal(r.taxableAfter, 100800);
  assert.equal(r.conversion, 100800 - 7800);
});

test("no room when taxable income already above the bracket", () => {
  const r = rothConversion({ filingStatus: "single", agi: 200000, targetRate: 0.12 });
  assert.equal(r.conversion, 0);
  assert.ok(r.findings.some((f) => /No room/.test(f.title)));
});

test("senior deduction phase-out: effective rate exceeds the bracket rate", () => {
  const plain = rothConversion({ filingStatus: "single", agi: 70000, targetRate: 0.22 });
  const senior = rothConversion({ filingStatus: "single", agi: 70000, targetRate: 0.22, seniors: 1 });
  assert.ok(senior.effectiveRate > plain.effectiveRate);
  assert.ok(senior.findings.some((f) => /phase-out/.test(f.title)));
  // taxable ends exactly at the bracket top in both cases
  assert.equal(senior.taxableAfter, 105700);
});

test("senior deduction identity: extra $2,050 + phased $6,000 at AGI under threshold", () => {
  const t = taxableAt(70000, { status: "single", seniors: 1, deductionOverride: 0 });
  assert.equal(t, 70000 - (STANDARD_DEDUCTION.single + 2050) - 6000);
});

test("IRMAA cliff finding when conversion crosses $109,000 single", () => {
  const r = rothConversion({ filingStatus: "single", agi: 60000, targetRate: 0.24 });
  assert.ok(r.findings.some((f) => /IRMAA/.test(f.title)));
});

test("ladder years from balance", () => {
  const r = rothConversion({ filingStatus: "single", agi: 60000, targetRate: 0.22, balance: 500000 });
  assert.equal(r.ladderYears, Math.ceil(500000 / 61800));
});

test("bracket table is monotone and ends at 37%", () => {
  for (const t of Object.values(BRACKETS)) {
    for (let i = 1; i < t.length; i++) assert.ok(t[i][0] > t[i - 1][0]);
    assert.equal(t.at(-1)[1], 0.37);
  }
});

test("bad input is safe", () => {
  const r = rothConversion({ agi: -5, filingStatus: "zzz", targetRate: 9 });
  assert.equal(r.status, "single");
  assert.equal(r.targetRate, 0.24);
  assert.equal(r.conversion, 201775 + 16100);
});
