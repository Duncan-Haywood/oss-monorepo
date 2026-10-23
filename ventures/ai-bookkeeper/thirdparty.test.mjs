// OFX layouts seen in other open-source projects' test files (ofxparse, MIT):
// CDATA-wrapped names and a NAME repeated at the start of MEMO. The snippets
// are rewritten here in their shape; they are not a bank's real downloads.
import test from "node:test";
import assert from "node:assert/strict";
import { readOfx, readQif } from "./bank.mjs";

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

test("QIF !Account blocks are not transactions, and several account sections are flagged", () => {
  const q = "!Option:AutoSwitch\n!Account\nNChecking\nTBank\n^\n!Type:Bank\nD01/05/2026\nT-5.00\nPA\n^\n!Account\nNVisa\nTCCard\n^\n!Type:CCard\nD01/06/2026\nT-7.00\nPB\n^\n!Clear:AutoSwitch\n";
  const r = readQif(q);
  assert.equal(r.rows.length, 2);
  assert.ok(!r.problems.some((p) => /unreadable/.test(p)));
  assert.ok(r.problems.some((p) => /2 account sections/.test(p)));
  assert.deepEqual(readQif("!Type:Bank\nD01/05/2026\nT-5.00\nPA\n^\n").problems, []);
});

// csv2ofx (MIT) test file pcmastercard.csv, rewritten in its shape: a card export
// of purchases only, every amount positive, no payment row to read the sign from.
test("a purchases-only card file with positive amounts books as charges", async () => {
  const { newBooks, importStatement } = await import("./engine.mjs");
  const csv = `"Merchant Name","Card Used For Transaction","Date","Time","Amount"\n"Mobil","**** 1234","01/10/2019","06:50 PM","36.33"\n"APL*ITUNES.COM/BILL","**** 4567","12/15/2018","05:08 PM","13.98"\n`;
  const r = importStatement(newBooks(), csv, "2000");
  assert.deepEqual(r.books.transactions.map((t) => t.cents), [-3633, -1398]);
  assert.ok(r.problems.some((p) => /read as charges/.test(p)));
  const k = importStatement(newBooks(), csv, "2000", { invert: false });
  assert.deepEqual(k.books.transactions.map((t) => t.cents), [3633, 1398]);
  const chk = importStatement(newBooks(), csv, "1000");
  assert.deepEqual(chk.books.transactions.map((t) => t.cents), [3633, 1398]);
});
