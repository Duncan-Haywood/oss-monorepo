import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "./bank.mjs";

test("a DR/DB/Debit marker ahead of the amount makes it negative, like one after it", () => {
  for (const s of ["DR 12.50", "dr12.50", "DB 12.50", "Debit 12.50", "DR $12.50", "DR. 1,234.56"]) {
    assert.ok(parseCents(s) < 0, s);
  }
  assert.equal(parseCents("DR 12.50"), -1250);
  assert.equal(parseCents("12.50 DR"), -1250);
});

test("a CR marker, before or after, stays positive", () => {
  assert.equal(parseCents("CR 12.50"), 1250);
  assert.equal(parseCents("12.50 CR"), 1250);
});

test("currency words starting with db/dr do not flip the sign", () => {
  assert.equal(parseCents("12.50"), 1250);
  assert.equal(parseCents("د.ا.‏4.750"), 475);
});

test("a trailing minus or DR marker still counts when a currency code follows or sits between", () => {
  assert.equal(parseCents("12.50-USD"), -1250);
  assert.equal(parseCents("12.50- EUR"), -1250);
  assert.equal(parseCents("12.50 USD DR"), -1250);
  assert.equal(parseCents("12.50 USD"), 1250);
  assert.equal(parseCents("12.50 USD CR"), 1250);
  assert.equal(parseCents("-12.50 USD"), -1250);
});
