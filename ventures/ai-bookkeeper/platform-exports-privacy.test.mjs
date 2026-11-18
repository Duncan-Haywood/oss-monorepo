import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Platform exports (Gumroad, Paddle, Patreon, Ko-fi, Lemon Squeezy, Square) carry the buyer's
// name and email. Descriptions feed the categorizer, memory and CSV/QBO exports, so none of
// them may leak a customer's identity. Headers follow the other tests in this folder (from
// memory, no real export); every row is made up.
const SECRET_NAME = "Zorbel Quindrick";
const SECRET_MAIL = "zq.private@buyers.example";

const layouts = {
  gumroad: [
    "id,Item Name,Buyer Name,Purchase Email,Item Price,Quantity,Shipping,Sale Price,Gumroad Fee,Net Total,Date,Currency",
    `a1,Ebook,${SECRET_NAME},${SECRET_MAIL},$10.00,1,$0.00,$10.00,$1.00,$9.00,2024-01-05,usd`,
  ],
  paddle: [
    "Transaction ID,Status,Billed At,Product,Customer Email,Customer Name,Currency,Total,Fee,Earnings",
    `txn_1,completed,2026-10-01,Pro plan,${SECRET_MAIL},${SECRET_NAME},USD,29.00,2.15,26.85`,
  ],
  patreon: [
    "Date,Event Type,Patron Name,Patron Email,Gross Amount,Creator Platform Fee,Creator Payment Processing Fee,Creator Share",
    `2026-10-01,Pledge,${SECRET_NAME},${SECRET_MAIL},10.00,0.80,0.59,8.61`,
  ],
  kofi: [
    "DateTime (UTC),From,Message,Item,Received,Given,Currency,TransactionType,TransactionId,Reference,SalesCount,Quantity",
    `2026-10-02 14:05:11,${SECRET_NAME},from ${SECRET_MAIL},,5.00,,USD,Donation,aaa-111,r1,,`,
  ],
  lemonsqueezy: [
    "id,identifier,order_number,user_name,user_email,currency,subtotal,discount_total,tax,total,status,created_at,refunded_at,product_name",
    `1,aaa,1001,${SECRET_NAME},${SECRET_MAIL},USD,2900,0,0,2900,paid,2026-10-01T10:00:00Z,,Pro plan`,
  ],
};

for (const [name, lines] of Object.entries(layouts)) {
  test(`${name} export keeps buyer name and email out of descriptions`, () => {
    const res = readStatement(lines.join("\n"));
    const rows = res.rows ?? res;
    assert.ok(rows.length >= 1, `${name}: read no rows`);
    for (const r of rows) {
      assert.ok(!r.desc.includes(SECRET_NAME), `${name}: name in "${r.desc}"`);
      assert.ok(!r.desc.includes(SECRET_MAIL), `${name}: email in "${r.desc}"`);
    }
  });
}
