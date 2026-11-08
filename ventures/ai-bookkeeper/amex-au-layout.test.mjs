// Amex Australia's export puts "Date Processed" before Description and ends its
// header with "Amount " (a trailing space). Seen in a real person's file
// (danTaler/Savvr amex.csv, fetched at run time, never copied); rows below are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const csv = [
  "Date,Date Processed,Description,Card Member,Account #,Amount ",
  "06/10/2026,07/10/2026,EXAMPLE HOTEL SYDNEY,A PERSON,-11111,4.50 ",
  "05/10/2026,06/10/2026,EXAMPLE GROCER BRISBANE,A PERSON,-11111,61.50",
].join("\n");

test("Amex AU layout with Date Processed is recognised and purchase-only files book as spending", () => {
  const r = readStatement(csv, { dayFirst: true });
  assert.equal(r.bank, "amex");
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, -6150]);
  assert.equal(r.rows[0].date, "2026-10-06");
});
test("a refund row in a purchases-only Amex file stays positive", () => {
  const r = readStatement(csv + "\n04/10/2026,05/10/2026,EXAMPLE SHOP,A PERSON,-11111,-20.00", { dayFirst: true });
  assert.equal(r.rows[2].cents, 2000);
});
