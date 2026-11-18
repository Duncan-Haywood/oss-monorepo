import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

test("bunq: Name is the payee, decimal comma read, file labelled bunq", () => {
  const r = readStatement(readFileSync(new URL("./fixtures/bunq-sample.csv", import.meta.url), "utf8"));
  assert.equal(r.bank, "bunq");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 125000]);
  assert.deepEqual(r.rows.map((x) => x.desc), ["Albert Heijn", "Client BV"]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-03", "2026-10-05"]);
});
