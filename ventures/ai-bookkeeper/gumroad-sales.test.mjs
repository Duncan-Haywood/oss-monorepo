import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows Gumroad's sales export from memory of its help page; rows are made up.
const csv = [
  "id,Item Name,Buyer Name,Purchase Email,Item Price,Quantity,Shipping,Sale Price,Gumroad Fee,Net Total,Date,Currency",
  "abc,Ebook,Jo Buyer,jo@example.com,$10.00,1,$0.00,$10.00,$1.00,$9.00,2024-01-05,usd",
  "abd,Course,Al Buyer,al@example.com,$50.00,1,$0.00,$50.00,$5.00,$45.00,2024-01-06,usd",
].join("\n");

test("Gumroad sales export books Net Total under the item sold", () => {
  const rows = readStatement(csv).rows ?? readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [900, 4500]);
  assert.deepEqual(rows.map((r) => r.desc), ["Ebook", "Course"]);
  assert.ok(!rows.some((r) => /example\.com|Buyer/.test(r.desc)));
});
