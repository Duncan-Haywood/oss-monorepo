import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairInvoice } from "./repair.mjs";

const valid = () => JSON.parse(readFileSync(new URL("./examples/valid-invoice.json", import.meta.url), "utf8"));

test("a clean invoice is left alone", () => {
  const r = repairInvoice(valid());
  assert.equal(r.repaired, false);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.remaining, []);
});

test("wrong line net and totals are recomputed and the result passes", () => {
  const inv = valid();
  inv.lines[0].net = 150;
  inv.totals = { net: 1, tax: 2, gross: 3, prepaid: 38, due: 9 };
  const r = repairInvoice(inv);
  assert.equal(r.repaired, true);
  assert.deepEqual(r.invoice.totals, { net: 200, tax: 38, gross: 238, prepaid: 38, due: 200 });
  assert.ok(r.before.length > 0);
  assert.deepEqual(r.remaining, []);
  assert.ok(r.changes.every((c) => c.path && "from" in c && "to" in c && c.reason));
  assert.equal(inv.totals.net, 1, "input is not mutated");
});

test("lower-case currency is fixed", () => {
  const inv = valid();
  inv.currency = "eur";
  const r = repairInvoice(inv);
  assert.equal(r.invoice.currency, "EUR");
  assert.deepEqual(r.remaining, []);
});

test("an invalid tax rate is never invented; totals are left and finding remains", () => {
  const inv = valid();
  inv.lines[0].tax_percent = "abc";
  inv.totals.gross = 1;
  const r = repairInvoice(inv);
  assert.ok(r.remaining.some((e) => e.rule === "INV-011"));
  assert.equal(r.invoice.lines[0].tax_percent, "abc");
  assert.equal(r.invoice.totals.gross, 1);
});

test("identity and date defects are reported, not guessed", () => {
  const inv = valid();
  inv.issue_date = "24/08/2026";
  delete inv.customer.name;
  const r = repairInvoice(inv);
  assert.deepEqual(r.remaining.map((e) => e.rule).sort(), ["INV-003", "INV-006"]);
});

test("non-object input is returned unchanged", () => {
  const r = repairInvoice([]);
  assert.equal(r.repaired, false);
  assert.equal(r.remaining[0].rule, "INV-001");
});
