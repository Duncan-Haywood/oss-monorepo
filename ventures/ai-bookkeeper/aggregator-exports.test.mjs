// Rocket Money and Monarch exports (eval/aggregator-exports.mjs, 2026-11-14). Rows made up; the
// real files are fetched at run time and never copied.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { suggest, buildMemory, payeeKey } from "./categorize.mjs";
import { replay, keywordsAlone, APP_MAP } from "./eval/aggregator-exports.mjs";
import { hideColumn } from "./eval/mercury-exports.mjs";

const rocket = `Date,Original Date,Account Type,Account Name,Account Number,Institution Name,Name,Custom Name,Amount,Description,Category,Note,Ignored From,Tax Deductible
3/20/24,3/20/24,Credit Card,Business Gold,1001,American Express,Delta,,232.20,DELTA AIR LINES ATLANTA,Travel & Vacation,,,
3/21/24,3/21/24,Credit Card,Business Gold,1001,American Express,Joe's Diner,,41.10,TST* JOES DINER NEW YORK NY,Dining & Drinks,,,
3/22/24,3/22/24,Credit Card,Business Gold,1001,American Express,Delta,,-22.99,DELTA AIR LINES ATLANTA,Travel & Vacation,,,
3/23/24,3/23/24,Cash,Operating,2002,Chase,Client,,-1500.00,CLIENT PAYMENT ACH,Income,,,
3/24/24,3/24/24,Cash,Operating,2002,Chase,Hotels.com,,310.00,HOTELSCOM72791059909HOTELS.COM WA,Travel & Vacation,,,
`;

test("Rocket Money: named, money out read from positive amounts, refunds and deposits in", () => {
  const r = readStatement(rocket);
  assert.equal(r.bank, "rocket-money");
  assert.deepEqual(r.rows.map((x) => x.cents), [-23220, -4110, 2299, 150000, -31000]);
  assert.match(r.inferred, /Rocket Money/);
  assert.deepEqual(r.accountNames, ["Business Gold", "Operating"]);
  assert.equal(r.rows[1].desc, "TST* JOES DINER NEW YORK NY");
  assert.equal(r.rows[0].bankCat, "Travel & Vacation");
});

test("Rocket Money: one account read alone keeps the flipped signs", () => {
  const r = readStatement(rocket, { onlyAccount: "Operating" });
  assert.deepEqual(r.rows.map((x) => x.cents), [150000, -31000]);
});

test("Monarch: Original Statement read; Merchant kept where the statement is blank", () => {
  const csv = `Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags
2025-03-01,Kroger,Gas,Card (...1),KROGER FUEL #3532,,-41.00,
2025-03-02,Kroger,Groceries,Card (...1),KROGER #532 VIRGINIA,,-60.00,
2025-03-03,Corner Deli,Restaurants & Bars,Card (...1),,,-9.00,
`;
  const r = readStatement(csv);
  assert.equal(r.bank, "monarch");
  assert.deepEqual(r.rows.map((x) => x.desc), ["KROGER FUEL #3532", "KROGER #532 VIRGINIA", "Corner Deli"]);
  const model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
  assert.equal(suggest({ desc: r.rows[0].desc, cents: r.rows[0].cents }, model).account, "6160");
});

test("glued name, reference and web address: the name is the payee; a short reference is not", () => {
  assert.equal(payeeKey("HOTELSCOM72791059909HOTELS.COM WA"), "hotelscom");
  assert.equal(payeeKey("RECURRING PAYMENT REF #OPE879BQLW TO PRIME EQUITY"), "prime equity");
  assert.equal(payeeKey("SPRINT8006396111"), "sprint");
});

test("Monarch and Rocket Money category names read by the bank-category layer", () => {
  const model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
  const want = { "Restaurants & Bars": "6130", "Dining & Drinks": "6130", "Travel & Vacation": "6120", "Software & Tech": "6060",
    "Gas & Electric": "6140", "Internet & Cable": "6140", "Water": "6140", "Parking & Tolls": "6160", "Auto Maintenance": "6160" };
  for (const [bankCat, account] of Object.entries(want)) {
    const s = suggest({ desc: "ZQXV 1234", cents: -2000, bankCat }, model);
    assert.equal(s.account, account, bankCat);
    assert.equal(s.source, "bank-category");
  }
  assert.equal(suggest({ desc: "ZQXV 1234", cents: -2000, bankCat: "Shopping" }, model).account, null);
});

test("eval replay: the label column is hidden from the categorizer and only mapped money out is scored", () => {
  const { text, labels } = hideColumn(rocket, "Category");
  const read = readStatement(text);
  assert.ok(read.rows.every((x) => !x.bankCat));
  const r = replay(read.rows, labels);
  assert.equal(r.all.n, 3);
  assert.equal(keywordsAlone(read.rows, labels).n, 3);
  assert.deepEqual(APP_MAP["Dining & Drinks"], ["6130"]);
});
