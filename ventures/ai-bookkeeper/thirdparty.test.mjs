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

// Found sweeping the ofxstatement-lithuanian sample: Swedbank's record type 82 "Apyvarta" (turnover)
// rows are the day's debit and credit totals, and were booked as two extra transactions.
test("Swedbank LT turnover (Apyvarta) summary rows are not booked as transactions", () => {
  const sw = [
    '"Sąskaitos Nr.","","Data","Gavėjas","Paaiškinimai","Suma","Valiuta","D/K"',
    '"LT00","20","2012-01-02","Cafe","PIRKINYS Cafe Vilnius","14.34","EUR","D"',
    '"LT00","20","2012-01-03","Acme","Pavedimas Acme","50.00","EUR","K"',
    '"LT00","82","2012-01-31","","Apyvarta","14.34","EUR","D"',
    '"LT00","82","2012-01-31","","Apyvarta","50.00","EUR","K"',
  ].join("\n");
  const r = readStatement(sw);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1434, 5000]);
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

test("CAMT.053 card entry whose only text is AddtlNtryInf after NtryDtls is not blank (Actual Budget sample shape)", () => {
  const ntry = (inf, extra = "") => `<Ntry><Amt Ccy="EUR">89.85</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2024-03-12</Dt></BookgDt>
<NtryDtls><TxDtls><Refs><EndToEndId>VSDB 4395 9061</EndToEndId></Refs><Amt Ccy="EUR">89.85</Amt><CdtDbtInd>DBIT</CdtDbtInd>${extra}</TxDtls></NtryDtls><AddtlNtryInf>${inf}</AddtlNtryInf></Ntry>`;
  const doc = (n) => `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04"><BkToCstmrStmt><Stmt>${n}</Stmt></BkToCstmrStmt></Document>`;
  const r = readStatement(doc(ntry("Supermarkt A")));
  assert.equal(r.rows[0].desc, "Supermarkt A");
  assert.equal(r.rows[0].cents, -8985);
  // the party and the remittance text still win over the entry-level text
  const r2 = readStatement(doc(ntry("Rega", "<RltdPties><Cdtr><Nm>Rega</Nm></Cdtr></RltdPties><RmtInf><Ustrd>Rechnung 17</Ustrd></RmtInf>")));
  assert.equal(r2.rows[0].desc, "Rega Rechnung 17");
});

test("Actual Budget's OFX and QIF samples (MIT; shape rewritten, newest-first, cp1252 QIF) read every line", () => {
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20190123120000<TRNAMT>-30.00<FITID>1<NAME>PATIENT FIRST TOKEN 01/22 PURCHA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20190122120000<TRNAMT>-3.77<FITID>2<NAME>STARBUCKS STORE 07604 01/21 PURC</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>12798.01<DTASOF>20190124212851</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = readStatement(ofx);
  assert.deepEqual(r.rows.map((x) => x.cents), [-3000, -377]);
  assert.equal(r.statement.cents, 1279801);
  const q = readStatement("!Type:Bank\nD12/19/18\nPCOUNTY WASTE 12/18 PURCHASE\nT-25.00\nC*\n^\nD12/20/18\nPLOFT 0845 CHES\nT-31.33\nC*\n^\n");
  assert.deepEqual(q.rows.map((x) => [x.date, x.cents]), [["2018-12-19", -2500], ["2018-12-20", -3133]]);
});

// ofxstatement-intesasp (GPLv3; its two column layouts read from the sdist, rows made up here).
test("Intesa Sanpaolo's older export (Accrediti / Addebiti, Descrizione estesa) is read by its header", () => {
  const csv = `Data contabile,Data valuta,Descrizione,Accrediti,Addebiti,Descrizione estesa,Mezzo
15/03/2026,15/03/2026,Pagamento POS,,"-12,50",Bar Roma Milano,Carta
16/03/2026,16/03/2026,Stipendio o pensione,"1.800,00",,Acme Srl stipendio marzo,Bonifico`;
  const r = readStatement(csv);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 180000]);
  assert.equal(r.rows[0].desc, "Pagamento POS Bar Roma Milano");
  assert.ok(!r.problems.some((p) => /preamble/.test(p)));
});

test("Intesa Sanpaolo's newer export (Operazione / Dettagli) no longer imports with empty descriptions", () => {
  const csv = `Data;Operazione;Dettagli;Conto o carta;Contabilizzazione;Categoria;Valuta;Importo
15/03/2026;Pagamento POS;Bar Roma Milano;Carta 1234;Contabilizzato;Bar e caffè;EUR;-12,50
16/03/2026;Stipendio;Acme Srl;Conto 99;Contabilizzato;Entrate;EUR;1.800,00`;
  const r = readStatement(csv);
  assert.equal(r.rows[0].desc, "Bar Roma Milano Pagamento POS");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 180000]);
});

// Actual Budget's import fixtures (MIT; a 2019 Bank of America QIF and QFX, read only).
// Shapes rewritten here with made-up payees and amounts.
test("a Bank of America-style QIF with CRLF, cleared flags and long truncated payees reads every line", () => {
  const q = "!Type:Bank\r\nD12/19/18\r\nPCOUNTY WASTE 12/18 PURCHASE 804-8439288 VA\r\nT-25.00\r\nC*\r\n^\r\nD12/19/18\r\nPTARGET DEBIT CRD DES:ACH TRAN ID:XXXXX0370723991 INDN:A SMITH 9321 CO I\r\nT-41.92\r\nC*\r\n^\r\n";
  const r = readStatement(q);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2500, -4192]);
  assert.equal(r.rows[0].date, "2018-12-19");
  assert.deepEqual(r.problems, []);
});

test("a QFX with an INTU.BID sign-on block and SGML header reads like OFX", () => {
  const f = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20190124212851.000[0:UTC]<LANGUAGE>ENG<FI><ORG>Test Bank<FID>5959</FI><INTU.BID>6526</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>0<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>USD<BANKACCTFROM><BANKID>012345678<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><DTSTART>20190101<DTEND>20190123
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20190123120000<TRNAMT>-30.00<FITID>1<NAME>PATIENT FIRST 01/22 PURCHA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20190123120000<TRNAMT>-3.77<FITID>2<NAME>COFFEE STORE 01/21 PURC</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = readStatement(f);
  assert.deepEqual(r.rows.map((x) => x.cents), [-3000, -377]);
  assert.equal(r.rows[0].date, "2019-01-23");
});

// ofxstatement-n26 (column order and type names read from its sdist; rows made up here).
// N26's Italian, French and Spanish exports name the payee "Beneficiario" / "Bénéficiaire".
test("N26 exports in Italian, French and Spanish no longer import with empty descriptions", () => {
  const mk = (head, a, b) => `${head}\n${a}\n${b}\n`;
  const cases = [
    [mk(`"Data","Beneficiario","Numero Conto","Tipo Transazione","Riferimento di pagamento","Categoria","Importo (EUR)"`, `"2026-10-15","Esselunga","","Pagamento MasterCard","","Alimentari","-23.45"`, `"2026-10-16","Cliente Srl","IT60X0542811101000000123456","Entrata","Fattura 4","Entrate","1500.00"`), "Cliente Srl Fattura 4"],
    [mk(`"Date","Bénéficiaire","Numéro de compte","Type de transaction","Référence de paiement","Catégorie","Montant (EUR)"`, `"2026-10-15","Carrefour","","Paiement Mastercard","","Alimentation","-23.45"`, `"2026-10-16","Client SARL","FR7630006000011234567890189","Virement entrant","Facture 4","Revenus","1500.00"`), "Client SARL Facture 4"],
    [mk(`"Fecha","Beneficiario","Número de cuenta","Tipo de transacción","Referencia de pago","Categoría","Importe (EUR)"`, `"2026-10-15","Mercadona","","Pago Mastercard","","Alimentación","-23.45"`, `"2026-10-16","Cliente SL","ES9121000418450200051332","Ingreso","Factura 4","Ingresos","1500.00"`), "Cliente SL Factura 4"],
  ];
  for (const [csv, second] of cases) {
    const r = readStatement(csv);
    assert.deepEqual(r.rows.map((x) => x.cents), [-2345, 150000]);
    assert.equal(r.rows[1].desc, second);
    assert.ok(r.rows[0].desc.length > 3);
  }
});

test("Stripe balance-transactions export: Created (UTC) is the date and Net the amount, not a preamble-skipped single row", () => {
  const r = readStatement([
    "id,Type,Source,Amount,Fee,Destination Platform Fee,Net,Currency,Created (UTC),Available On (UTC),Description",
    "txn_1,charge,ch_1,100.00,3.20,0.00,96.80,usd,2026-03-01 10:00,2026-03-03 00:00,Pro plan",
    "txn_2,payout,po_9,-96.80,0.00,0.00,-96.80,usd,2026-03-04 11:00,2026-03-04 00:00,STRIPE PAYOUT",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2026-03-01", 9680, "Pro plan"], ["2026-03-04", -9680, "STRIPE PAYOUT"]]);
  assert.deepEqual(r.problems, []);
});

test("Pipe-delimited export reads like the comma one", () => {
  const r = readStatement("Date|Description|Amount\n2026-03-02|CAFE, LUNA|-12.50\n2026-03-03|PAYROLL|1800.00\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2026-03-02", -1250, "CAFE, LUNA"], ["2026-03-03", 180000, "PAYROLL"]]);
});

// Layout seen in ledger-autosync's Venmo fixture (GPL-3.0, read only; every
// value below is made up): the header's first column is "Username", row 2
// holds only the account's own name, and the file ends with undated balance
// rows and a long legal notice. Not seen as Venmo, the notice was glued onto
// the last transaction's description.
test("Venmo export with a Username column: footer rows are not part of the last description", () => {
  const r = readStatement([
    "Username,ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (fee),Funding Source,Destination,Beginning Balance,Ending Balance,Statement Period Venmo Fees,Year to Date Venmo Fees,Disclaimer",
    'someone,,,,,,,,,,,,"$0",,,,',
    ",1,2020-01-01T13:00:00,Payment,Complete,lunch,Pat,Sam,+ $50.03,,,Venmo balance,,,,,",
    ",2,2020-01-03T20:00:00,Payment,Complete,rent,Sam,Lee,- $12.01,,Venmo balance,,,,,,",
    ',,,,,,,,,,,,,"$38.02",,,',
    ',,,,,,,,,,,,,,,,"In case of errors or questions,\n  call us."',
  ].join("\n"));
  assert.equal(r.bank, "venmo");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2020-01-01", 5003, "Pat - lunch"], ["2020-01-03", -1201, "Lee - rent"]]);
  assert.deepEqual(r.problems, []);
});

test("an OFX date that is no calendar day is skipped, not booked (ofxparse's date_missing.ofx has 20120231)", () => {
  const r = readOfx(wrap(`<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20120231<TRNAMT>200.00<FITID>1<NAME>TestFail2</STMTTRN>
    <STMTTRN><TRNTYPE>OTHER<DTPOSTED>20120229<TRNAMT>5.00<FITID>2<NAME>Leap day</STMTTRN>`));
  assert.deepEqual(r.rows.map((x) => x.date), ["2012-02-29"]);
  assert.equal(r.problems.length, 1);
});

test("a trade list (ticker, qty, price, amount) books a buy as cash out", () => {
  // Shape of Maybe's trades import (AGPL, read only); rows made up here.
  const csv = "date,ticker,qty,price,amount,account,name\n2023-01-15,AAPL,10,150.25,1502.50,Brokerage,Buy Apple Inc\n2023-06-15,AAPL,-5,170.50,-852.50,Brokerage,Sell Apple Inc\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-150250, 85250]);
  assert.match(r.inferred, /trade list/);
  assert.equal(readStatement(csv, { invert: false }).rows[0].cents, 150250);
});

test("a MEMO written as TYPE;NAME does not repeat the name", () => {
  const r = readOfx(wrap(`<STMTTRN><TRNTYPE>POS<DTPOSTED>20090401122017.000[-5:EST]<TRNAMT>-6.60<FITID>1<NAME>MCDONALD'S #112<MEMO>POS MERCHANDISE;MCDONALD'S #112</STMTTRN>`));
  assert.equal(r.rows[0].desc, "MCDONALD'S #112 POS MERCHANDISE");
});

test("a brokerage cash-activity file with the trade-list headers is not flipped (beangulp's example.csv)", () => {
  // Headers of a Schwab-style activity export (beangulp, GPL, read only); rows made up here.
  const csv = "DATE,TRANSACTION ID,DESCRIPTION,QUANTITY,SYMBOL,PRICE,COMMISSION,AMOUNT,NET CASH BALANCE\n07/02/2013,1,ORDINARY DIVIDEND (HDV),,HDV,,,31.04,31.04\n07/02/2013,2,MONEY MARKET PURCHASE,,,,,-31.04,0.00\n07/02/2013,3,MONEY MARKET PURCHASE (MMDA10),31.04,MMDA10,,,0.00,0.00\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [3104, -3104]);
  assert.equal(r.inferred ?? null, null);
});

// Schwab's brokerage "Transactions" export, in the shape of beancount-import's
// (GPL, read only, nothing copied) test file: a title line above the header, a
// trailing comma on every row, a "Transactions Total" row. Its sample has no rows
// (an empty period) and was read as zero rows with no explanation. Rows are made up.
test("Schwab brokerage transactions: totals row skipped, trades not booked as spending, empty period explained", () => {
  const head = '"Transactions  for account Brokerage XXXX-1234 as of 11/30/2020 18:00:00 ET From 11/16/2020 to 11/29/2020"\n"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount",\n';
  const empty = readStatement(head + '""\n');
  assert.equal(empty.bank, "schwab-brokerage");
  assert.equal(empty.rows.length, 0);
  assert.ok(empty.problems.some((p) => /no transaction rows/.test(p)));
  const full = readStatement(head +
    '"11/25/2020","Bank Interest","","BANK INT","","","","$1.23",\n"11/20/2020","MoneyLink Deposit","","TFR FROM CHECKING","","","","$500.00",\n' +
    '"11/18/2020","Buy","SCHA","SCHWAB SMALL CAP ETF","10","$80.00","","-$800.00",\n"11/19/2020","Service Fee","","ADVISORY FEE","","","","-$2.00",\n"Transactions Total","","","","","","","-$298.77",\n');
  assert.deepEqual(full.rows.map((r) => r.cents), [123, 50000, -200]);
  assert.ok(full.problems.some((p) => /1 brokerage buy\/sell line was not booked/.test(p)));
  assert.ok(!full.problems.some((p) => /unreadable date|Every amount is positive/.test(p)));
});

// Ally-style QFX pretty-printed with each value on the line after its tag
// (found sweeping beancount_reds_importers' test files, GPL, read only; the file below is made up).
test("OFX with every value on the line after its tag still reads", () => {
  const qfx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>
USD</CURDEF>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>
DEBIT</TRNTYPE>
<DTPOSTED>
20240109121112</DTPOSTED>
<TRNAMT>
-55.00</TRNAMT>
<FITID>
1</FITID>
<NAME>
Corner Cafe</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
  const r = readStatement(qfx);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].date, "2024-01-09");
  assert.equal(r.rows[0].cents, -5500);
  assert.equal(r.rows[0].desc, "Corner Cafe");
});

test("Schwab checking export without a Status column, with note lines under the header", () => {
  // Layout seen in beancount-import's Schwab test data (GPL, read only); rows here are made up.
  const csv = [
    'Transactions  for Checking account EAC as of 12/23/2020 16:00:10 ET',
    '"Date","Type","Check #","Description","Withdrawal (-)","Deposit (+)","RunningBalance"',
    '"Pending Transactions are not reflected within this sort criterion."',
    '"Posted Transactions"',
    '"11/13/2020","ACH","","Example Ext Trnsfr","","$10,500.00","$10,550.01"',
    '"10/27/2020","ACH","","Example Auth Debit","$1.10","","$50.01"',
  ].join("\n");
  const r = readStatement(csv);
  assert.equal(r.bank, "schwab");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [1050000, -110]);
});
