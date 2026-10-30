// Shape of Amazon's Business "Order History" report, seen in egh/ledger-autosync's
// fixtures (GPL, cloned at run time, read only, nothing copied; rows made up).
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const csv = `Order Date,Order ID,Title,Category,Quantity,Payment Instrument Type,Item Subtotal,Item Subtotal Tax,Item Total,Currency
01/29/16,111-0000000-0000001,"Dish soap",Health and Beauty,2,"Visa - 1111",$20.00,$1.90,$21.90,USD
02/03/16,111-0000000-0000002,"Printer paper",Office Products,1,"Visa - 1111",$8.00,$0.76,$8.76,USD
02/10/16,111-0000000-0000003,"USB cable",Electronics,1,"Visa - 1111",$6.00,$0.57,$6.57,USD
`;

test("an Amazon order-history report reads: Order Date, Title, Item Total", () => {
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [
    ["2016-01-29", "Dish soap", 2190],
    ["2016-02-03", "Printer paper", 876],
    ["2016-02-10", "USB cable", 657],
  ]);
});

test("purchases-only file is flagged, and reads as charges with invert", () => {
  assert.ok(readStatement(csv).problems.some((p) => /Every amount is positive/.test(p)));
  assert.deepEqual(readStatement(csv, { invert: true }).rows.map((x) => x.cents), [-2190, -876, -657]);
});
