// The City of Toronto's PCard expenditure report, header copied from the real
// file (November 2017); every row below is made up. Before 2026-11-11 the reader
// found no lines in it at all: "Transaction Amt." was not an amount column, and the
// fallback took the cost-centre description over "Merchant Name".
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { loadToronto, GL_MAP } from "./eval/toronto-pcard.mjs";

const HEADER = "Division ,Batch Transaction ID,Transaction Date,Card Posting Dt,Merchant Name,Transaction Amt.,Trx Currency,Original Amount,Original Currency,G/L Account,G/L Account Description,Cost Center / WBS Element / Order,Cost Center / WBS Element / Order Description,Merchant Type,Merchant Type Description,Purpose";
const FILE = [
  HEADER,
  'PARKS DIVISION,9001-1,2017-11-02,2017-11-03,MAPLE HARDWARE CO,45.10,CAD,45.10,CAD,2710,GENERAL HARDWARE,P1000,EAST YARD,5251,"Hardware Stores, Equipment",SCREWS',
  ",,,,,45.10,CAD,45.10,CAD,,,,,,,",
  "PARKS DIVISION,9001-2,2017-11-04,2017-11-06,NORTHWIND FUELS,61.00,CAD,61.00,CAD,2260,GASOLINE,P1000,EAST YARD,5542,\"Fuel Dispenser, Automated\",FUEL",
  ",,,,,61.00,CAD,61.00,CAD,,,,,,,",
  "LIBRARY,9002-1,2017-11-05,2017-11-07,MAPLE HARDWARE CO,-12.00,CAD,-12.00,CAD,2710,GENERAL HARDWARE,L2000,BRANCH,5251,\"Hardware Stores, Equipment\",RETURN",
  ",,,,,-12.00,CAD,-12.00,CAD,,,,,,,",
].join("\n");

test("Toronto's PCard report reads: merchant, amount, MCC code, subtotals folded into one note", () => {
  const r = readStatement(FILE);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents, x.mcc]), [
    ["2017-11-02", "MAPLE HARDWARE CO", 4510, "5251"],
    ["2017-11-04", "NORTHWIND FUELS", 6100, "5542"],
    ["2017-11-05", "MAPLE HARDWARE CO", -1200, "5251"],
  ]);
  assert.deepEqual(r.problems, ["3 rows with an amount but no date or description (subtotals) skipped."]);
});

test("a merchant type description column alone is kept as the category name", () => {
  const r = readStatement(["Transaction Date,Merchant Name,Transaction Amt.,Merchant Type Description", '2017-11-02,ACME,10.00,"Eating Places, Restaurants"'].join("\n"));
  assert.equal(r.rows[0].mcc, "Eating Places, Restaurants");
});

test("a row with a description but no date is still reported, not taken for a subtotal", () => {
  const r = readStatement([HEADER, "PARKS,1,,2017-11-03,ACME,5.00,CAD,5.00,CAD,2710,GENERAL HARDWARE,P,Y,5251,Hardware,X"].join("\n"));
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0], /unreadable date/);
});

test("the eval loader keeps mapped charges with the code and name, drops credits", () => {
  const rows = loadToronto(FILE);
  assert.deepEqual(rows.map((x) => [x.desc, x.cents, x.mcc, x.want]), [
    ["MAPLE HARDWARE CO", -4510, "5251 Hardware Stores, Equipment", GL_MAP["2710"]],
    ["NORTHWIND FUELS", -6100, "5542 Fuel Dispenser, Automated", ["6160"]],
  ]);
  assert.equal(loadToronto(FILE, { field: "code" })[0].mcc, "5251");
});
