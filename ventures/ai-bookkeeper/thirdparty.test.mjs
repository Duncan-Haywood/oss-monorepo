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

test("an OFX error reply or an investment-only file says what it is, not 'no transactions'", () => {
  const err = readOfx("<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>15500<SEVERITY>ERROR<MESSAGE>Your password was incorrect</STATUS><DTSERVER>20130325</SONRS></SIGNONMSGSRSV1></OFX>");
  assert.match(err.problems[0], /error reply.*15500.*password was incorrect/);
  const inv = readOfx("<OFX><INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><INVPOSLIST></INVPOSLIST></INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>");
  assert.match(inv.problems[0], /investment statement/);
  assert.match(readOfx("<OFX></OFX>").problems[0], /No transactions/);
});

// A camt.052 account report in the shape of the one in the fints project's tests
// (MIT; ISO-8859-1, camt.052.001.08, one <Rpt>, a credit and a debit), rewritten
// here. Real banks send 052 and 054 as well as 053; the reader keyed on 053 only.
test("camt.052 reports and camt.054 notifications are recognised; several reports are flagged", async () => {
  const { readStatement } = await import("./bank.mjs");
  const ntry = (ind, amt, d, ref) => `<Ntry><Amt Ccy="EUR">${amt}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>${d}</Dt></BookgDt><ValDt><Dt>${d}</Dt></ValDt><NtryDtls><TxDtls><RmtInf><Ustrd>${ref}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
  const doc = (root, inner) => `<?xml version="1.0" encoding="ISO-8859-1" ?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.0${root === "BkToCstmrDbtCdtNtfctn" ? "54.001.08" : "52.001.08"}"><${root}>${inner}</${root}></Document>`;
  const rpt = (tag) => `<${tag}><Id>1</Id>${ntry("CRDT", "35.00", "2025-10-28", "Reference")}${ntry("DBIT", "29.63", "2025-11-07", "Supplier Foobar")}</${tag}>`;
  const a = readStatement(doc("BkToCstmrAcctRpt", rpt("Rpt")));
  assert.equal(a.bank, "camt053");
  assert.deepEqual(a.rows.map((r) => r.cents), [3500, -2963]);
  assert.deepEqual(a.problems, []);
  const n = readStatement(doc("BkToCstmrDbtCdtNtfctn", rpt("Ntfctn")));
  assert.equal(n.bank, "camt053");
  assert.equal(n.rows.length, 2);
  const two = readStatement(doc("BkToCstmrAcctRpt", rpt("Rpt") + rpt("Rpt")));
  assert.ok(two.problems.some((p) => /2 statements or reports/.test(p)));
});
