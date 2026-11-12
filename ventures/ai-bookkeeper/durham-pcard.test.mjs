// Durham County Council's procurement-card report, header copied from the real
// files (2020-2026); every row below is made up. Before 2026-11-12 the reader did
// not recognise the header at all and fell back to guessing: the description was
// the department or the purpose of the spend, not the merchant, the merchant
// category code was dropped, and every charge was booked as money in.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { loadDurham, wantFor, dmy, EXPENSE_MAP } from "./eval/durham-pcard.mjs";

const HEADER = "Local authority department which incurred the expenditure,Service Division,Cost Centre,Summary of the Purpose of Expenditure,Expense Type,Expense Code,Detailed Expense Type,Date of Transaction,Transaction Number,Beneficiary,Merchant Category Number,Merchant Category,Gross Amount,VAT,Net Amount";
const ROWS = [
  "Resources BK0010,Corporate Property,020079,Bldg Serv - Electrical,Supplies and Services,304221,Direct materials,04-JUN-26,X1,Northgate Electrical,5065,Electrical Parts and Equipment,13.56,2.26,11.30",
  "Children and Young Peoples Services,Early Help,071801,Riverside Childcare Centre,Supplies and Services,304403,Equipment and Materials,05-JUN-26,X2,AMZNMktplace,5999,Other consumables,21.96,3.66,18.30",
  "Children and Young Peoples Services,Early Help,071801,Riverside Childcare Centre,Supplies and Services,324000,Provisions E324,06-JUN-26,X3,MARKET GROCER 2916,5411,Catering costs - provisions,\"1,206.75\",0.00,\"1,206.75\"",
  "Neighbourhoods and Climate Change,Fleet,051000,Depot,Transport,348000,Running Costs of Vehicles,07-JUN-26,X4,U OF I ONLINE PAYMENT,5542,Fuel,40.00,6.67,33.33",
  "Resources BK0010,Corporate Property,020079,Bldg Serv - Electrical,Supplies and Services,304221,Direct materials,08-JUN-26,X5,Northgate Electrical,5065,Electrical Parts and Equipment,-13.56,-2.26,-11.30",
];
const FILE = [HEADER, ...ROWS].join("\n");

test("Durham's report reads: merchant, gross amount as a charge, the network's code", () => {
  const r = readStatement(FILE);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents, x.mcc]), [
    ["2026-06-04", "Northgate Electrical", -1356, "5065"],
    ["2026-06-05", "AMZNMktplace", -2196, "5999"],
    ["2026-06-06", "MARKET GROCER 2916", -120675, "5411"],
    ["2026-06-07", "U OF I ONLINE PAYMENT", -4000, "5542"],
    ["2026-06-08", "Northgate Electrical", 1356, "5065"],
  ]);
  assert.match(r.inferred, /merchant category codes, 4 of 5 amounts positive/);
});

test("the report's title line above the header is skipped", () => {
  const r = readStatement(["Procurement Card Transactions  From Date : '01/06/2025' , To Date : '30/06/2025'" + ",".repeat(14), HEADER, ...ROWS].join("\n"));
  assert.equal(r.rows.length, 5);
  assert.equal(r.rows[0].desc, "Northgate Electrical");
});

test("invert: false keeps the signs as printed", () => {
  assert.equal(readStatement(FILE, { invert: false }).rows[0].cents, 1356);
});

test("a card file whose amounts are mostly negative is not flipped", () => {
  const r = readStatement(["Date,Description,Amount,MCC", "2026-06-01,CAFE,-4.50,5814", "2026-06-02,HARDWARE,-20.00,5251", "2026-06-03,REFUND,3.00,5251"].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, -2000, 300]);
});

test("a plain bank file with no category column keeps its signs", () => {
  const r = readStatement(["Date,Description,Amount", "2026-06-01,DEPOSIT,450.00", "2026-06-02,DEPOSIT,20.00", "2026-06-03,FEE,-3.00"].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [45000, 2000, -300]);
});

test("SumUp's Gross/Fee/Net export still books the net", () => {
  const r = readStatement(["Transaction ID,Transaction date,Type,Description,Payout date,Gross amount,Fee,Net amount", "T1,2026-10-03 12:00,Sales,Card sale,2026-10-05,50.00,0.65,49.35"].join("\n"));
  assert.equal(r.rows[0].cents, 4935);
});

test("the eval loader: dates both ways, ledger codes dropped, unmapped types and refunds left out", () => {
  assert.equal(dmy("04-JUN-26"), "2026-06-04");
  assert.equal(dmy("01-Mar-2023"), "2023-03-01");
  assert.equal(dmy("2023-03-01"), "");
  assert.deepEqual(wantFor("Provisions E324"), EXPENSE_MAP["provisions"]);
  assert.deepEqual(wantFor("Legal expenses 338045"), EXPENSE_MAP["legal expenses"]);
  assert.equal(wantFor("Miscellaneous Expenses"), null);
  const rows = loadDurham([FILE]);
  assert.deepEqual(rows.map((x) => [x.desc, x.cents, x.mcc, x.department]), [
    ["Northgate Electrical", -1356, "5065", "Resources"],
    ["AMZNMktplace", -2196, "5999", "Children and Young Peoples Services"],
    ["MARKET GROCER 2916", -120675, "5411", "Children and Young Peoples Services"],
    ["U OF I ONLINE PAYMENT", -4000, "5542", "Neighbourhoods and Climate Change"],
  ]);
  // The council's own label rides in "Merchant Category"; only --field name reads it.
  assert.equal(loadDurham([FILE], { field: "name" })[2].mcc, "Catering costs - provisions");
});
