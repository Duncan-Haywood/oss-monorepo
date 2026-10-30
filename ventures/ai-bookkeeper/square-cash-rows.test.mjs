import { test } from "node:test";
import assert from "node:assert/strict";
import { readPayoutReport } from "./payouts.mjs";

// Column layout of a real Square dashboard Transactions export (2024 layout, seen in a public
// repository's sample file; only the layout is used here, the rows are made up). Cash sales sit
// beside card sales with no Deposit ID, and are never paid out.
const HEAD = "Date,Time,Time Zone,Gross Sales,Discounts,Service Charges,Net Sales,Gift Card Sales,Tax,Tip,Partial Refunds,Total Collected,Source,Card,Card Entry Methods,Cash,Square Gift Card,Other Tender,Other Tender Type,Other Tender Note,Fees,Net Total,Transaction ID,Payment ID,Event Type,Deposit ID,Deposit Date";
const row = (id, total, card, cash, fee, net, type, dep) =>
  `2024-08-24,16:21:50,Mountain Time (US & Canada),${total},$0.00,$0.00,${total},$0.00,$0.00,$0.00,$0.00,${total},Point of Sale,${card},N/A,${cash},$0.00,$0.00,"","",${fee},${net},${id},${id},${type},${dep},${dep ? "2024-08-25" : ""}`;
const csv = [
  HEAD,
  row("a", "$20.00", "$0.00", "$20.00", "$0.00", "$20.00", "Payment", ""),
  row("b", "$25.00", "$25.00", "$0.00", "-$0.26", "$24.74", "Payment", "DEP1"),
  row("c", "-$105.00", "$0.00", "-$105.00", "$0.00", "-$105.00", "Refund", ""),
  row("d", "$80.00", "$80.00", "$0.00", "-$0.67", "$79.33", "Payment", "DEP1"),
  row("e", "$30.00", "$30.00", "$0.00", "-$0.40", "$29.60", "Payment", ""),
].join("\n");

test("cash and other-tender rows are not waiting for a payout", () => {
  const r = readPayoutReport(csv);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 2474 + 7933);
  assert.deepEqual(r.offPlatform.map((x) => x.id), ["a", "c"]);
  assert.equal(r.offPlatform.reduce((a, x) => a + x.net, 0), -8500);
});

test("a card row with no deposit yet is still pending", () => {
  assert.deepEqual(readPayoutReport(csv).pending.map((x) => x.id), ["e"]);
});
