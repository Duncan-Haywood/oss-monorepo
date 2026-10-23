// OFX layouts seen in other open-source projects' test files (ofxparse, MIT):
// CDATA-wrapped names and a NAME repeated at the start of MEMO. The snippets
// are rewritten here in their shape; they are not a bank's real downloads.
import test from "node:test";
import assert from "node:assert/strict";
import { readOfx } from "./bank.mjs";

const wrap = (trn) => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>${trn}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("CDATA-wrapped NAME and MEMO are read, not dropped", () => {
  const r = readOfx(wrap(`<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20131215</DTPOSTED><TRNAMT>-16.85</TRNAMT><FITID>1</FITID>
    <NAME><![CDATA[EFTPOS WDL HANDYWAY ALDI STORE  ]]></NAME><MEMO><![CDATA[EFTPOS WDL HANDYWAY ALDI STORE   GEELONG WEST VICAU]]></MEMO></STMTTRN>`));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].desc, "EFTPOS WDL HANDYWAY ALDI STORE GEELONG WEST VICAU");
  assert.equal(r.rows[0].cents, -1685);
});

test("a MEMO that starts with the NAME is not repeated", () => {
  const r = readOfx(wrap(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20110405120000.000<TRNAMT>-34.51<FITID>7<NAME>AUTOMATIC WITHDRAWAL, ELECTRIC BILL<MEMO>AUTOMATIC WITHDRAWAL, ELECTRIC BILL WEB(S )</STMTTRN>`));
  assert.equal(r.rows[0].desc, "AUTOMATIC WITHDRAWAL, ELECTRIC BILL WEB(S )");
});

test("a different NAME and MEMO are both kept", () => {
  const r = readOfx(wrap(`<STMTTRN><TRNTYPE>POS<DTPOSTED>20090401<TRNAMT>-6.60<FITID>9<NAME>MCDONALD'S #112<MEMO>POS MERCHANDISE</STMTTRN>`));
  assert.equal(r.rows[0].desc, "MCDONALD'S #112 POS MERCHANDISE");
});
