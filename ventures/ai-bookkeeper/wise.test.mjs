import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout from memory of Wise's statement CSV (newer exports add "Date Time"); rows made up.
const HEAD = `"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount"`;
const OLD = `"TransferWise ID",Date,Amount,Currency,Description,"Payment Reference","Running Balance"
CARD-1,06-03-2024,-12.50,USD,"Card transaction at Blue Bottle",,987.50
TRANSFER-9,07-03-2024,1500.00,USD,"Received money from ACME Inc",INV-4,2487.50
`;
const NEW = `${HEAD}
CARD-1,06-03-2024,"06-03-2024 10:11:12.123",-12.50,USD,"Card transaction at Blue Bottle",,987.50,,,,,,,Blue Bottle,1234,Jane Doe,,,0.00,
TRANSFER-9,07-03-2024,"07-03-2024 09:00:00.000",1500.00,USD,"Received money from ACME Inc",INV-4,2487.50,,,,ACME Inc,,,,,,,,0.00,
`;

test("Wise dates are day first, with or without the Date Time column", () => {
  for (const csv of [OLD, NEW]) {
    const r = readStatement(csv);
    assert.deepEqual(r.rows.map((x) => x.date), ["2024-03-06", "2024-03-07"]);
    assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 150000]);
  }
});
