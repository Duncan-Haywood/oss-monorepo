// BAI2 reading. The files are written by hand from the BAI2 layout (records
// 01/02/03/16/88/49/98/99); they are not a bank's real downloads.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, sniffFormat } from "./bank.mjs";
import { readBai2, isBai2 } from "./bai2.mjs";

const FILE = [
  "01,0004,CITIBANK,260105,0900,1,80,,2/",
  "02,CITIBANK,0004,1,260104,2359,USD,2/",
  "03,0975312468,USD,010,500000,,,015,512550,,,040,500000,,/",
  "16,195,20000,0,B001,INV-1002,ACME CORP WIRE/",
  "16,451,7500,0,B002,,CHECK PAID 1044/",
  "16,475,1250,V,260106,0000,B003,C9",
  "88,CHECK PAID 1045, LONG PAYEE/",
  "16,399,0,0,,,ZERO ROW/",
  "16,169,3300,S,3300,0,0,B004,,ACH CREDIT STRIPE/",
  "49,1025300,5/",
  "98,1025300,1,7/",
  "99,1025300,1,8/",
].join("\n");

test("BAI2 is recognised and read with signs from the type codes", () => {
  assert.ok(isBai2(FILE));
  assert.equal(sniffFormat(FILE), "bai2");
  const r = readStatement(FILE);
  assert.equal(r.bank, "bai2");
  assert.deepEqual(r.rows.map((x) => x.cents), [20000, -7500, -1250, 3300]);
  assert.equal(r.rows[0].date, "2026-01-04");
  assert.equal(r.rows[0].desc, "ACME CORP WIRE ref INV-1002 bank ref B001");
  assert.deepEqual(r.problems, []);
});

test("V funds type gives the value date and an 88 line continues the text", () => {
  const r = readBai2(FILE);
  assert.equal(r.rows[2].date, "2026-01-06");
  assert.equal(r.rows[2].desc, "CHECK PAID 1045, LONG PAYEE ref C9 bank ref B003");
});

test("S funds type skips its three availability amounts", () => {
  assert.equal(readBai2(FILE).rows[3].desc, "ACH CREDIT STRIPE bank ref B004");
});

test("closing ledger balance (015) is the statement balance", () => {
  assert.deepEqual(readBai2(FILE).statement, { cents: 512550, date: "2026-01-04" });
});

test("more than one account is flagged and gets no balance; odd codes are named", () => {
  const two = FILE.replace("49,", "49,").replace("98,", "03,222,USD,015,100,,/\n16,801,500,0,,,LOAN ADV/\n98,");
  const r = readBai2(two);
  assert.match(r.problems.join(" "), /2 accounts/);
  assert.match(r.problems.join(" "), /type code 801/);
  assert.equal(r.statement, null);
});

test("invert flips signs and an empty BAI2 says so", () => {
  assert.equal(readStatement(FILE, { invert: true }).rows[0].cents, -20000);
  const none = readBai2("01,1,2,260105,0900,1,80,,2/\n02,a,b,1,260104,2359,USD,2/\n03,1,USD,015,5,,/\n");
  assert.match(none.problems[0], /No 16 transaction records/);
});
