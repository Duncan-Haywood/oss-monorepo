import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Headers written from memory of public sample layouts, made-up rows.
test("M-Pesa: Paid In is money in, Withdrawn is money out, Completion Time is the date", () => {
  const csv = "Receipt No.,Completion Time,Details,Transaction Status,Paid In,Withdrawn,Balance\nQCB1,2026-03-01 10:00:00,Customer Payment from 2547xxx - JOHN,COMPLETED,1500.00,,1500.00\nQCB2,2026-03-02 10:00:00,Pay Bill to 888880 - KPLC,COMPLETED,,500.00,1000.00\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [150000, -50000]);
  assert.equal(r.problems.length, 0);
});

test("GCash: 'Date and Time' with a 12-hour clock", () => {
  const csv = "Date and Time,Description,Reference No.,Debit,Credit,Balance\n2026-03-01 10:00 PM,Express Send to JUAN,1234,500.00,0.00,1000.00\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-01", -50000]]);
});

test("Indonesian Jumlah column with DB/CR suffixes, day first", () => {
  const csv = 'Tanggal,Keterangan,Cabang,Jumlah,Saldo\n01/03/2026,TRSF E-BANKING DB,0000,"12,500.00 DB","100,000.00"\n02/03/2026,GAJI,0000,"2,500,000.00 CR","2,600,000.00"\n';
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-01", -1250000], ["2026-03-02", 250000000]]);
});
