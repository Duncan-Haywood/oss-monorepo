// Amount and date spellings seen in bank exports that parseCents / parseDate
// once misread silently (found by probing, 2026-10-23).
import test from "node:test";
import assert from "node:assert/strict";
import { parseCents, parseDate } from "./bank.mjs";

test("amounts: the last separator is the decimal point whatever the flag says", () => {
  for (const flag of [false, true]) {
    assert.equal(parseCents("1.234,56", flag), 123456);
    assert.equal(parseCents("€1.234,56", flag), 123456);
    assert.equal(parseCents("1,234.56", flag), 123456);
    assert.equal(parseCents("12.5", flag), 1250);
    assert.equal(parseCents("12,50", flag), 1250);
    assert.equal(parseCents("1 234,56", flag), 123456);
  }
});

test("amounts: a lone separator before three digits still follows the flag", () => {
  assert.equal(parseCents("1,234"), 123400);
  assert.equal(parseCents("1.234", true), 123400);
  assert.equal(parseCents("1.234"), 123);
});

test("amounts: parentheses anywhere mean negative", () => {
  assert.equal(parseCents("$ (12.00)"), -1200);
  assert.equal(parseCents("(12.00)CR"), -1200);
  assert.equal(parseCents("USD (1,000.00)"), -100000);
});

test("dates: compact, weekday-led, ordinal and run-together spellings", () => {
  for (const s of ["20261005", "Mon, Oct 5, 2026", "Monday 5 October 2026", "5th October 2026", "05Oct2026", "Oct 05 2026", "2026-10-05T14:03:00Z"])
    assert.equal(parseDate(s), "2026-10-05", s);
  assert.equal(parseDate("20261305"), null);
  assert.equal(parseDate("20260230"), null);
  assert.equal(parseDate("Oct 5, 2026"), "2026-10-05");
});
