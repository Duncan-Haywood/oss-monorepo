import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("Ramp: card spend is read as money out, merchant is the payee", () => {
  const r = read("ramp-sample.csv");
  assert.equal(r.bank, "ramp");
  assert.deepEqual(r.rows.map((x) => x.cents), [-12040, -3200]);
  assert.deepEqual(r.rows.map((x) => x.desc), ["AWS", "Notion"]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-03", "2026-10-05"]);
});

test("SumUp: the net amount is the cash, the description is the payee", () => {
  const r = read("sumup-sample.csv");
  assert.deepEqual(r.rows.map((x) => x.cents), [4935, -1000]);
  assert.deepEqual(r.rows.map((x) => x.desc), ["Card sale", "Refund"]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-03", "2026-10-04"]);
});
