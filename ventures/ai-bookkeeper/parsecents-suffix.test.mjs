import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "./bank.mjs";

test("a k, m or b scale suffix is not silently dropped", () => {
  for (const s of ["12.5k", "1.2M", "3b", "2k5", "1.5 K"]) assert.ok(Number.isNaN(parseCents(s)), s);
});

test("currency codes and DR/CR markers are not scale suffixes", () => {
  assert.equal(parseCents("12.00 CR"), 1200);
  assert.equal(parseCents("12.00 DR"), -1200);
  assert.equal(parseCents("USD 12.30"), 1230);
  assert.equal(parseCents("12.30 KWD"), 1230);
  assert.equal(parseCents("12.30 MYR"), 1230);
});
