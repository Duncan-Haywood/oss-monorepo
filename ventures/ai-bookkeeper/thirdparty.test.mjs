// OFX layouts seen in other open-source projects' test files (ofxparse, MIT):
// CDATA-wrapped names and a NAME repeated at the start of MEMO. The snippets
// are rewritten here in their shape; they are not a bank's real downloads.
import test from "node:test";
import assert from "node:assert/strict";
import { readOfx, readQif, readStatement, parseDate } from "./bank.mjs";

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

// Lithuanian bank samples from ofxstatement-lithuanian (layouts rewritten with made-up rows).
test("Swedbank LT layout: Lithuanian headers, D/K flag, balance rows skipped; colon dates; short rows named", () => {
  const sw = [
    '"Sąskaitos Nr.","","Data","Gavėjas","Paaiškinimai","Suma","Valiuta","D/K"',
    '"LT00","10","2012-01-01","","Likutis pradžiai","100.00","EUR","K"',
    '"LT00","20","2012-01-02","Cafe","PIRKINYS Cafe Vilnius","14.34","EUR","D"',
    '"LT00","20","2012-01-03","Acme","Pavedimas Acme","50.00","EUR","K"',
    '"LT00","86","2012-01-31","","Likutis pabaigai","135.66","EUR","K"',
  ].join("\n");
  const r = readStatement(sw);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1434, 5000]);
  assert.ok(r.problems.some((p) => /balance row/.test(p)));
  assert.equal(parseDate("2012:03:01"), "2012-03-01");
  const short = "Date,Name,Amount\n2012:03:01,A,\"1.00\"\n2012:03:02,B\n";
  const s = readStatement(short);
  assert.equal(s.rows.length, 1);
  assert.ok(s.problems.some((p) => /fewer than the header/.test(p)));
});

test("a currency column with more than one currency is named, in any bank's file", () => {
  const f = [
    "Data,Suma,Valiuta,Paaiškinimai",
    "2026-03-01,-10.00,EUR,Cafe",
    "2026-03-02,-20.00,USD,Hotel",
    "2026-03-03,-5.00,EUR,Bus",
  ].join("\n");
  const r = readStatement(f);
  assert.equal(r.rows.length, 3);
  assert.ok(r.problems.some((p) => /mixes currencies \(EUR, USD\)/.test(p)));
  const one = readStatement(f.replace("USD", "EUR"));
  assert.ok(!one.problems.some((p) => /mixes currencies/.test(p)));
});

// ofxstatement-lithuanian (GPL-3 project, shape only, rewritten here) sample danske.csv: the header
// names 12 columns, every row has 10 or 11, so the amount is not where the header says.
test("a header wider than every row falls back to finding columns from the cells", () => {
  const csv = 'Date,Bank,Branch,Address,City,Country,Name,Memo,MemoConv,MemoDet,Amount,\r\n' +
    '2012:03:01,,"",",Vilnius,LT","Fee A","Fee for transfer",,"Operation 1",-7.8,\r\n' +
    '2012:03:01,BANK X,"",",Vilnius,LT","ACME LLC","Payment order from ACME",,,889.81,\r\n' +
    '2012:03:06,,"",",,","","Fee for 2012.03.06",,"Operation 7",-.46,\r\n';
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2012-03-01", -780], ["2012-03-01", 88981], ["2012-03-06", -46]]);
  assert.ok(r.problems.some((p) => /more columns than the rows have/.test(p)));
});

test("a Lithuanian LITAS-ESIS .acc file is read: D debits, K/C credits, balance lines skipped", () => {
  // Layout of the ofxstatement-lithuanian sample (tab-separated, no header); rows are made up.
  const row = (date, cents, flag, memo, payee) => ["010", "1", date, "", cents, cents, flag, "", "", "1", "id" + date, "", "", memo, "", "", "", payee].join("\t");
  const text = [
    ["000", "20120304", "", "AGBLLT2XXXX", "Bank"].join("\t"),
    ["020", "LikutisPR", "20120101", "", "25175", "25175"].join("\t"),
    row("20120127", "100", "D", "Mokestis už sąskaitos aptarnavimą", "AB DNB BANKAS"),
    row("20120217", "30000", "C", "Hello World", "LINUS TORVALDS"),
    row("20120218", "5000", "K", "Grąžinimas", "UAB Test"),
    ["020", "LikutisPB", "20120304", "", "55075", "55075"].join("\t"),
  ].join("\r\n");
  const r = readStatement(text);
  assert.equal(r.bank, "litas-esis");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2012-01-27", -100], ["2012-02-17", 30000], ["2012-02-18", 5000]]);
  assert.match(r.rows[0].desc, /AB DNB BANKAS Mokestis/);
  assert.deepEqual(r.problems, []);
});

test("a Czech GPC statement (Fio layout) is read: codes 1/5 debit, 2/4 credit, closing balance kept", () => {
  // Fixed-width lines built to the published layout; names, accounts and amounts are made up.
  const z = (v, n) => String(v).padStart(n, "0");
  const head = "074" + z("123456789", 16) + "NOVAK, JAN".padEnd(20) + "010514" + z(100000, 14) + "+" + z(70500, 14) + "+" + z(40000, 14) + "0" + z(10500, 14) + "0" + "003" + "310514" + " ".repeat(14);
  const tr = (cents, code, vs, name, due) => "075" + z("123456789", 16) + z("987654", 16) + z(1, 13).slice(0, 13) + z(cents, 12) + code + z(vs, 10) + "0800000000" + z(0, 10) + "000000" + name.padEnd(20) + "0" + "0203" + due;
  const text = [head, tr(40000, "1", 1234, "ACME S.R.O.", "030514"), tr(10500, "2", 0, "Klient Test", "050514"), tr(2500, "5", 0, "Storno", "060514"), tr(1000, "4", 0, "Storno", "070514"), tr(0, "1", 0, "Nula", "080514")].join("\r\n");
  const r = readStatement(text);
  assert.equal(r.bank, "gpc");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2014-05-03", -40000], ["2014-05-05", 10500], ["2014-05-06", -2500], ["2014-05-07", 1000]]);
  assert.match(r.rows[0].desc, /ACME S\.R\.O\. acc 987654\/0800 VS 1234/);
  assert.deepEqual(r.statement, { cents: 70500, date: "2014-05-31" });
  assert.deepEqual(r.problems, []);
});

test("a Czech 'Pohyby na uctu' text statement is read: blocks, wrapped notes rejoined, balance kept", () => {
  // Blocks built to the layout of the ofxstatement-czech samples (values start at column 20); names and numbers are made up.
  const kv = (k, v) => (k + ":").padEnd(19) + v;
  const block = (date, amt, bal, type, name, acct, note) => [kv("datum zaúčtování", date), kv("částka", amt), kv("měna", "CZK"), kv("zůstatek", bal), kv("konstantní symbol", ""), kv("variabilní symbol", "0000000009"), kv("specifický symbol", ""), kv("označení operace", type), kv("název protiúčtu", name), kv("protiúčet", acct), kv("poznámka", note), "", ""].join("\r\n");
  const text = "﻿Pohyby na účtu č.: 123456789, ze dne 18.03.2012 16:08\r\n\r\n" + [
    block("14.3.2012", "1743.00", "2000.50", "Došlá platba", "ACME S.R.O.", "1000453303/3500", "SALARY PRAHA 5".padEnd(30)),
    block("12.3.2012", "-250.50", "257.50", "Odchozí platba", "TELCO", "500114004/2700", "INVOICE 36202" + "\r\n" + " ".repeat(19) + "45785"),
  ].join("\r\n");
  const r = readStatement(text);
  assert.equal(r.bank, "cz-text");
  assert.equal(r.account, "123456789");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.balance]), [["2012-03-14", 174300, 200050], ["2012-03-12", -25050, 25750]]);
  assert.equal(r.rows[0].desc, "Došlá platba ACME S.R.O. acc 1000453303/3500 VS 9 SALARY PRAHA 5");
  assert.match(r.rows[1].desc, /INVOICE 3620245785$/);
  assert.deepEqual(r.problems, []);
});

test("OFX line with no NAME or MEMO is described by its type and check number (ofxtools stmtrs shape)", () => {
  const r = readOfx(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CHECK</TRNTYPE><DTPOSTED>20051004</DTPOSTED><TRNAMT>-200.00</TRNAMT><FITID>00002</FITID><CHECKNUM>1000</CHECKNUM></STMTTRN>
<STMTTRN><TRNTYPE>ATM</TRNTYPE><DTPOSTED>20051020</DTPOSTED><TRNAMT>-300.00</TRNAMT><FITID>00003</FITID></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
  assert.deepEqual(r.rows.map((x) => x.desc), ["Check #1000", "ATM"]);
});
