import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows the column names a third-party Patreon importer reads (Date, Event Type,
// Creator Share, Creator Platform Fee, Creator Payment Processing Fee); rows are made up.
const csv = [
  "Date,Event Type,Patron Name,Gross Amount,Creator Platform Fee,Creator Payment Processing Fee,Creator Share",
  "2026-10-01,Pledge,Sam Patron,10.00,0.80,0.59,8.61",
  "2026-10-01,Pledge,Lee Patron,5.00,0.40,0.45,4.15",
  "2026-10-15,Refund,Sam Patron,-10.00,-0.80,-0.59,-8.61",
].join("\n");

test("Patreon earnings report books Creator Share under the event type", () => {
  const { rows } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [861, 415, -861]);
  assert.deepEqual(rows.map((r) => r.desc), ["Pledge", "Pledge", "Refund"]);
  assert.ok(!rows.some((r) => /Patron/.test(r.desc)));
});
