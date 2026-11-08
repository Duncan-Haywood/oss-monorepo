import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout seen in a public Bank of America checking export (2023-24; every row here is made up):
// a Zelle memo containing a comma is written as two cells, which shifted the amount one cell right.
// The amount was then read from the memo's tail digits (-40.30 became +47.00) with no warning.
const head = ["Description,,Summary Amt.", "Beginning balance as of 01/01/2024,,\"100.00\"", "Total credits,,\"0.00\"", "Total debits,,\"-50.30\"", "Ending balance as of 01/31/2024,,\"49.70\"", "", "Date,Description,Amount,Running Bal.,"];

test("Zelle memo split by a comma keeps its amount and balance", () => {
  const r = readStatement([...head,
    "1/1/24,Beginning balance as of 01/01/2024,,100,",
    '1/4/24,"Zelle payment to A B for Thanks," Jo! :)""; Conf# ab12cd""",-40.3,59.7',
    "1/9/24,COFFEE SHOP,-10,49.7,",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.cents, x.balance]), [[-4030, 5970], [-1000, 4970]]);
  assert.match(r.rows[0].desc, /Thanks, Jo!/);
  assert.deepEqual(r.problems, []);
});

test("rows with a normal amount are untouched", () => {
  const r = readStatement(["Date,Description,Amount", "1/4/24,SHOP A,-5.00", "1/5/24,SHOP B,12.50"].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-500, 1250]);
});
