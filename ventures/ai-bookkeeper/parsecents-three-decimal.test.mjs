import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "./bank.mjs";

test("a nonzero third decimal on a three-decimal currency is reported, not truncated", () => {
  for (const s of ["1.234 BHD", "KWD 12.505", "0,005 OMR", "4.751 JOD", "9.999 tnd"]) assert.ok(Number.isNaN(parseCents(s)), s);
});

test("three-decimal currencies with a zero third digit, and two-decimal ones, still read", () => {
  assert.equal(parseCents("4.750 JOD"), 475);
  assert.equal(parseCents("12.30 KWD"), 1230);
  assert.equal(parseCents("1.234 USD"), 123);
  assert.equal(parseCents("1,234.50 BHD"), 123450);
});
