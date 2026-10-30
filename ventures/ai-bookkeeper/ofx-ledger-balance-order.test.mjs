// ofxtools' br_nubank_cc.ofx (Nubank credit card, newest day first, three lines on the
// newest day, one LEDGERBAL): the balance was put on the third line of that day, so a
// running-balance check read the first two lines as already paid for. Rows here are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const ofx = (rows) => `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL\n<BANKTRANLIST>\n${rows.map(([d, a, n]) => `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d}<TRNAMT>${a}<NAME>${n}</STMTTRN>`).join("\n")}\n</BANKTRANLIST><LEDGERBAL><BALAMT>-30.00<DTASOF>20240325</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("a newest-first file puts the ledger balance on the first line of the newest day", () => {
  const r = readStatement(ofx([["20240323", "-1.00", "A"], ["20240323", "-2.00", "B"], ["20240323", "-3.00", "C"], ["20240322", "-24.00", "D"]]));
  assert.deepEqual(r.rows.map((x) => x.balance), [-3000, null, null, null]);
});

test("an oldest-first file keeps it on the last line of the newest day", () => {
  const r = readStatement(ofx([["20240322", "-24.00", "D"], ["20240323", "-1.00", "A"], ["20240323", "-2.00", "B"], ["20240323", "-3.00", "C"]]));
  assert.deepEqual(r.rows.map((x) => x.balance), [null, null, null, -3000]);
});
