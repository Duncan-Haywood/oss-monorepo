import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows Square's transactions export (Gross Sales ... Fees, Net Total, Transaction ID, Event Type);
// rows are made up. Before this, no row was read at all.
const csv = [
  "Date,Time,Time Zone,Gross Sales,Discounts,Net Sales,Gift Card Sales,Tax,Tip,Partial Refunds,Total Collected,Source,Card,Card Entry Methods,Cash,Square Gift Card,Other Tender,Other Tender Type,Other Tender Note,Fees,Net Total,Transaction ID,Payment ID,Card Brand,PAN Suffix,Device Name,Staff Name,Staff ID,Details,Description,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Device Nickname,Third Party Fees,Deposit ID,Deposit Date,Fee Percentage Rate,Fee Fixed Rate,Refund Reason",
  "2024-03-01,12:01:02,Eastern Time (US & Canada),$40.00,$0.00,$40.00,$0.00,$3.20,$5.00,$0.00,$48.20,Square Point of Sale,$48.20,Swiped,$0.00,$0.00,$0.00,,,-$1.69,$46.51,tx1,pay1,Visa,1234,Reg 1,Sam,s1,https://x,Coffee,Payment,Main,,,,,,$0.00,dep1,2024-03-02,2.60%,$0.10,",
  "2024-03-02,09:00:00,Eastern Time (US & Canada),-$10.00,$0.00,-$10.00,$0.00,-$0.80,$0.00,$0.00,-$10.80,Square Point of Sale,-$10.80,Swiped,$0.00,$0.00,$0.00,,,$0.31,-$10.49,tx2,pay2,Visa,1234,Reg 1,Sam,s1,https://x,Coffee,Refund,Main,,,,,,$0.00,dep1,2024-03-02,2.60%,$0.10,Wrong",
].join("\n");

test("Square transactions export books Net Total, the money Square pays out", () => {
  const { rows } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [4651, -1049]);
  assert.equal(rows[0].desc, "Coffee");
  assert.equal(rows[1].date, "2024-03-02");
});
