import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts written from memory of HDFC, BBVA México, Indonesian and Arabic bank
// exports; rows are made up, no real bank download. 05/03/26 with a day-first
// header is 5 March, not 3 May.
const rd = (lines) => readStatement(lines.join("\n"));
const out = (r) => r.rows.map((x) => [x.date, x.cents, x.desc]);

test("HDFC-style Narration / Withdrawal Amt. / Deposit Amt. read day first", () => {
  const r = rd(["Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    "05/03/26,UPI-SWIGGY-123,0000123,05/03/26,540.00,,99460.00",
    "12/03/26,NEFT-SALARY ACME,N123,12/03/26,,100000.00,199460.00"]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -54000, "UPI-SWIGGY-123"], ["2026-03-12", 10000000, "NEFT-SALARY ACME"]]);
});

test("Spanish Cargo/Abono and Fecha operación read day first", () => {
  const r = rd(["Fecha,Concepto,Cargo,Abono,Saldo", "05/03/2026,OXXO TIENDA,150.00,,9850.00", "06/03/2026,NOMINA,,12000.00,21850.00"]);
  assert.deepEqual(out(r), [["2026-03-05", -15000, "OXXO TIENDA"], ["2026-03-06", 1200000, "NOMINA"]]);
  const r2 = rd(["Fecha operación,Fecha valor,Concepto,Importe,Saldo", '05/03/2026,05/03/2026,MERCADONA,"-45,20","1.000,00"']);
  assert.deepEqual(out(r2), [["2026-03-05", -4520, "MERCADONA"]]);
});

test("Indonesian Tanggal/Keterangan/Debet/Kredit map with no preamble warning", () => {
  const r = rd(["Tanggal,Keterangan,Debet,Kredit,Saldo", '05/03/2026,WARUNG,"150.000,00",,"9.850.000,00"', '06/03/2026,GAJI,,"12.000.000,00","21.850.000,00"']);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -15000000, "WARUNG"], ["2026-03-06", 1200000000, "GAJI"]]);
});

test("Arabic headers map", () => {
  const r = rd(["التاريخ,الوصف,مدين,دائن,الرصيد", "2026-03-05,سوبرماركت,100.00,,900.00", "2026-03-06,راتب,,5000.00,5900.00"]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -10000, "سوبرماركت"], ["2026-03-06", 500000, "راتب"]]);
});
