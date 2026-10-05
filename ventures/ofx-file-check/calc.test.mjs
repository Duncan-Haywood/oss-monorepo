import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, findingsCsv, diffLines, checkOfxDate, normaliseDate, decodeBuffer, sampleFile, sampleBrokenFile } from "./calc.mjs";

const HDR = ["OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "", ""].join("\n");
const trn = (o = {}) => {
  const f = { TRNTYPE: "DEBIT", DTPOSTED: "20240304", TRNAMT: "-10.00", FITID: "A1", NAME: "SHOP", ...o };
  return "<STMTTRN>\n" + Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `<${k}>${v}`).join("\n") + "\n</STMTTRN>\n";
};
const doc = ({ header = HDR, trns = [trn()], acct = "<BANKID>123456789\n<ACCTID>999\n<ACCTTYPE>CHECKING\n", start = "20240301", end = "20240331", ledger = "<LEDGERBAL>\n<BALAMT>100.00\n<DTASOF>20240331\n</LEDGERBAL>\n" } = {}) =>
  header + `<OFX>\n<SIGNONMSGSRSV1>\n<SONRS>\n<STATUS>\n<CODE>0\n<SEVERITY>INFO\n</STATUS>\n<DTSERVER>20240331\n<LANGUAGE>ENG\n</SONRS>\n</SIGNONMSGSRSV1>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<TRNUID>1\n<STATUS>\n<CODE>0\n<SEVERITY>INFO\n</STATUS>\n<STMTRS>\n<CURDEF>USD\n<BANKACCTFROM>\n${acct}</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>${start}\n<DTEND>${end}\n${trns.join("")}</BANKTRANLIST>\n${ledger}</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>\n`;
const titles = (r) => r.findings.map((f) => f.title);
const has = (r, re) => r.findings.some((f) => re.test(f.title));

test("a clean SGML file has no findings and the summary counts add up", () => {
  const r = validate(doc({ trns: [trn(), trn({ FITID: "A2", TRNTYPE: "CREDIT", TRNAMT: "25.50" })] }));
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.format, "sgml");
  assert.equal(r.summary.version, "102");
  assert.equal(r.summary.transactions, 2);
  assert.equal(r.summary.total, "15.50");
  assert.equal(r.summary.credits, "25.50");
  assert.equal(r.summary.debits, "-10.00");
});

test("bundled samples: clean one is clean, broken one has fixable and unfixable findings", () => {
  assert.equal(validate(sampleFile()).summary.errors, 0);
  const b = validate(sampleBrokenFile());
  assert.ok(b.summary.errors >= 5 && b.summary.fixable >= 4);
  assert.ok(b.findings.some((f) => !f.fixable));
});

test("detects XML (2.x) files and checks the <?OFX?> header", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF><BANKACCTFROM><BANKID>1</BANKID><ACCTID>2</ACCTID><ACCTTYPE>SAVINGS</ACCTTYPE></BANKACCTFROM><BANKTRANLIST><DTSTART>20240101</DTSTART><DTEND>20240131</DTEND><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20240102</DTPOSTED><TRNAMT>5.00</TRNAMT><FITID>X</FITID><NAME>N</NAME></STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>5.00</BALAMT><DTASOF>20240131</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n`;
  const r = validate(xml);
  assert.equal(r.summary.format, "xml");
  assert.equal(r.summary.version, "211");
  assert.equal(r.summary.transactions, 1);
  assert.ok(!r.findings.some((f) => f.severity === "error"), JSON.stringify(r.findings));
  const bad = validate(xml.replace(' VERSION="211"', "").replace("<FITID>X</FITID>", "<FITID>X"));
  assert.ok(has(bad, /<\?OFX\?> header is missing VERSION/));
  assert.ok(has(bad, /<FITID> is not closed/));
});

test("XML unclosed value tags are closed by the fix", () => {
  const xml = `<?xml version="1.0"?>\n<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20240101</DTSERVER><LANGUAGE>ENG</LANGUAGE></SONRS></SIGNONMSGSRSV1></OFX>`;
  const broken = xml.replace("<LANGUAGE>ENG</LANGUAGE>", "<LANGUAGE>ENG");
  const f = repair(broken);
  assert.ok(f.changes.some((c) => /Closed <LANGUAGE>/.test(c)));
  assert.ok(f.text.includes("<LANGUAGE>ENG</LANGUAGE>"));
  assert.ok(!has(validate(f.text), /not closed/));
});

test("header: missing, invalid and unknown lines", () => {
  assert.ok(has(validate(doc({ header: HDR.replace("COMPRESSION:NONE\n", "") })), /Header is missing COMPRESSION/));
  assert.ok(has(validate(doc({ header: HDR.replace("OFXHEADER:100", "OFXHEADER:200") })), /OFXHEADER should be 100/));
  assert.ok(has(validate(doc({ header: HDR.replace("DATA:OFXSGML", "DATA:XML") })), /DATA should be OFXSGML/));
  assert.ok(has(validate(doc({ header: HDR.replace("VERSION:102", "VERSION:999") })), /Unusual OFX version/));
  assert.ok(has(validate(doc({ header: HDR.replace("SECURITY:NONE", "SECURITY:MAYBE") })), /SECURITY/));
  assert.ok(has(validate(doc({ header: HDR + "" }).replace("NEWFILEUID:NONE", "NEWFILEUID:NONE\nFOO:1")), /Unknown header line FOO/));
  assert.ok(has(validate(doc({ header: HDR.slice(0, -1) })), /No blank line/));
  const none = validate(doc({ header: "" }));
  assert.ok(has(none, /No OFX header/));
});

test("repair adds a missing header and a blank line", () => {
  const f = repair(doc({ header: "" }));
  assert.ok(f.text.startsWith("OFXHEADER:100\nDATA:OFXSGML\nVERSION:102"));
  assert.equal(validate(f.text).summary.errors, 0);
  const g = repair(doc({ header: HDR.replace("COMPRESSION:NONE\n", "").replace("OFXHEADER:100", "OFXHEADER:200") }));
  assert.match(g.text, /^OFXHEADER:100\n/);
  assert.match(g.text, /COMPRESSION:NONE\n/);
  assert.equal(validate(g.text).summary.errors, 0);
});

test("balanced tags: unclosed aggregate mid-file and at end of file, stray close", () => {
  const mid = doc().replace("</BANKTRANLIST>\n", "");
  assert.ok(has(validate(mid), /Unclosed tag before <\/STMTRS>/));
  assert.equal(validate(repair(mid).text).summary.errors, 0);
  const eof = doc().replace("</OFX>\n", "");
  assert.ok(has(validate(eof), /File ends with tags still open/));
  const fixed = repair(eof).text;
  assert.match(fixed, /<\/OFX>\s*$/);
  assert.equal(validate(fixed).summary.errors, 0);
  const stray = doc().replace("</OFX>\n", "</OFX>\n</STMTTRN>\n");
  assert.ok(has(validate(stray), /no matching open tag/));
  assert.ok(!repair(stray).text.includes("</STMTTRN>\n</STMTTRN>"));
});

test("required STMTTRN fields: missing and blank", () => {
  for (const k of ["TRNTYPE", "DTPOSTED", "TRNAMT", "FITID"]) {
    const r = validate(doc({ trns: [trn({ [k]: null })] }));
    assert.ok(has(r, new RegExp(`missing ${k}`)), k);
  }
  assert.ok(has(validate(doc({ trns: [trn({ FITID: "" })] })), /FITID is blank/));
  assert.ok(has(validate(doc({ trns: [trn({ TRNTYPE: "BOGUS" })] })), /Unknown TRNTYPE/));
});

test("DTPOSTED format: valid forms pass, bad ones fail, ISO is fixable, slash dates are not", () => {
  for (const ok of ["20240304", "20240304120000", "20240304120000.123", "20240304120000.000[-5:EST]", "20240304120000[0:GMT]", "20240304[+1]"]) assert.equal(checkOfxDate(ok).ok, true, ok);
  for (const bad of ["2024-03-04", "20240230", "20241301", "240304", "20240304250000", "03/04/2024", ""]) assert.equal(checkOfxDate(bad).ok, false, bad);
  assert.equal(normaliseDate("2024-03-04"), "20240304");
  assert.equal(normaliseDate("2024-03-04T09:30:00"), "20240304093000");
  assert.equal(normaliseDate("2024-02-30"), null);
  const iso = validate(doc({ trns: [trn({ DTPOSTED: "2024-03-04" })] }));
  assert.ok(iso.findings.find((f) => /DTPOSTED is not/.test(f.title)).fixable);
  const slash = validate(doc({ trns: [trn({ DTPOSTED: "03/04/2024" })] }));
  assert.equal(slash.findings.find((f) => /DTPOSTED is not/.test(f.title)).fixable, false);
  const f = repair(doc({ trns: [trn({ DTPOSTED: "2024-03-04T09:30:00" })] }));
  assert.match(f.text, /<DTPOSTED>20240304093000\n/);
});

test("TRNAMT must be numeric with a period; comma decimals are reported but never rewritten", () => {
  for (const bad of ["12,50", "$12.50", "(12.50)", "abc", ""]) assert.ok(has(validate(doc({ trns: [trn({ TRNAMT: bad })] })), /TRNAMT/), bad);
  for (const ok of ["-12.5", "+3", "100", ".5", "0.00"]) assert.ok(!has(validate(doc({ trns: [trn({ TRNAMT: ok, TRNTYPE: "OTHER" })] })), /TRNAMT is not/), ok);
  const src = doc({ trns: [trn({ TRNAMT: "12,50" })] });
  assert.ok(repair(src).text.includes("<TRNAMT>12,50"));
});

test("sign against type is warned", () => {
  assert.ok(has(validate(doc({ trns: [trn({ TRNAMT: "10.00" })] })), /DEBIT with a positive amount/));
  assert.ok(has(validate(doc({ trns: [trn({ TRNTYPE: "CREDIT", TRNAMT: "-10.00" })] })), /CREDIT with a negative amount/));
});

test("duplicate FITIDs are errors and are made unique deterministically", () => {
  const src = doc({ trns: [trn({ FITID: "D" }), trn({ FITID: "D" }), trn({ FITID: "D" }), trn({ FITID: "D-2", NAME: "X" })] });
  const r = validate(src);
  assert.equal(r.findings.filter((f) => f.title === "Duplicate FITID").length, 2);
  const f = repair(src);
  const ids = [...f.text.matchAll(/<FITID>(.+)/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, ids.join());
  assert.equal(validate(f.text).summary.errors, 0);
  assert.equal(repair(src).text, f.text);
  assert.equal(repair(f.text).changes.length, 0);
});

test("the same FITID in two different accounts is not a duplicate", () => {
  const one = doc({ trns: [trn({ FITID: "S" })] });
  const two = doc({ trns: [trn({ FITID: "S" })], acct: "<BANKID>1\n<ACCTID>OTHER\n<ACCTTYPE>SAVINGS\n" });
  const body = (s) => s.slice(s.indexOf("<BANKMSGSRSV1>"), s.indexOf("</BANKMSGSRSV1>"));
  const merged = one.replace("</BANKMSGSRSV1>", body(two).replace("<BANKMSGSRSV1>", "") + "</BANKMSGSRSV1>");
  const r = validate(merged);
  assert.equal(r.summary.accounts, 2);
  assert.ok(!has(r, /Duplicate FITID/));
});

test("FITID length", () => {
  assert.ok(has(validate(doc({ trns: [trn({ FITID: "x".repeat(40) })] })), /longer than 32/));
  assert.ok(has(validate(doc({ trns: [trn({ FITID: "x".repeat(300) })] })), /longer than 255/));
});

test("DTSTART/DTEND consistency", () => {
  assert.ok(has(validate(doc({ start: "20240401", end: "20240301" })), /DTSTART is after DTEND/));
  assert.ok(has(validate(doc({ trns: [trn({ DTPOSTED: "20240415" })] })), /outside DTSTART-DTEND/));
  assert.ok(has(validate(doc({ start: "20240301", end: "20240331" }).replace("<DTEND>20240331\n", "")), /no DTEND/));
  assert.ok(has(validate(doc({ trns: [trn({ DTPOSTED: "20240229" })] }).replace("<DTSTART>20240301", "<DTSTART>20240230")), /DTSTART is not in OFX date format/));
});

test("account block: missing and blank BANKID/ACCTID/ACCTTYPE, bad type, credit cards", () => {
  assert.ok(has(validate(doc({ acct: "<BANKID>1\n<ACCTID>2\n" })), /missing ACCTTYPE/));
  assert.ok(has(validate(doc({ acct: "<BANKID>\n<ACCTID>2\n<ACCTTYPE>CHECKING\n" })), /BANKID is blank/));
  assert.ok(has(validate(doc({ acct: "<BANKID>1\n<ACCTID>   \n<ACCTTYPE>CHECKING\n" })), /ACCTID is blank/));
  assert.ok(has(validate(doc({ acct: "<BANKID>1\n<ACCTID>2\n<ACCTTYPE>CURRENT\n" })), /Invalid ACCTTYPE/));
  assert.ok(has(validate(doc({ acct: "<BANKID>1\n<ACCTID>" + "9".repeat(30) + "\n<ACCTTYPE>SAVINGS\n" })), /ACCTID longer than 22/));
  const cc = doc().replace(/BANKMSGSRSV1/g, "CREDITCARDMSGSRSV1").replace(/STMTTRNRS/g, "CCSTMTTRNRS").replace(/STMTRS/g, "CCSTMTRS").replace(/BANKACCTFROM/g, "CCACCTFROM").replace("<BANKID>123456789\n", "").replace("<ACCTTYPE>CHECKING\n", "");
  const r = validate(cc);
  assert.equal(r.summary.accounts, 1);
  assert.ok(!has(r, /BANKID|ACCTTYPE/), titles(r).join());
});

test("LEDGERBAL and AVAILBAL", () => {
  assert.ok(has(validate(doc({ ledger: "" })), /No LEDGERBAL/));
  assert.ok(has(validate(doc({ ledger: "<LEDGERBAL>\n<BALAMT>1,00\n<DTASOF>20240331\n</LEDGERBAL>\n" })), /LEDGERBAL BALAMT is not a number/));
  assert.ok(has(validate(doc({ ledger: "<LEDGERBAL>\n<BALAMT>1.00\n</LEDGERBAL>\n" })), /no DTASOF/));
  assert.ok(has(validate(doc({ ledger: "<LEDGERBAL>\n<BALAMT>1.00\n<DTASOF>20240331\n</LEDGERBAL>\n<AVAILBAL>\n<BALAMT>x\n<DTASOF>20240331\n</AVAILBAL>\n" })), /AVAILBAL BALAMT is not a number/));
});

test("special characters: unescaped & and < are errors with a fix; entities are left alone", () => {
  const r = validate(doc({ trns: [trn({ NAME: "AT&T", MEMO: "a &amp; b &#38; c" })] }));
  assert.equal(r.findings.filter((f) => /Unescaped &/.test(f.title)).length, 1);
  assert.match(repair(doc({ trns: [trn({ NAME: "AT&T & CO", MEMO: "x &amp; y" })] })).text, /<NAME>AT&amp;T &amp; CO\n<MEMO>x &amp; y\n/);
  const lt = doc({ trns: [trn({ NAME: "A < B" })] });
  assert.ok(has(validate(lt), /Unescaped </));
  assert.match(repair(lt).text, /A &lt; B/);
});

test("non-ASCII against ENCODING/CHARSET", () => {
  assert.ok(has(validate(doc({ trns: [trn({ NAME: "CAFÉ" })] })), /Non-ASCII characters in a USASCII file/));
  const utf = doc({ header: HDR.replace("ENCODING:USASCII", "ENCODING:UTF-8").replace("CHARSET:1252", "CHARSET:NONE"), trns: [trn({ NAME: "CAFÉ" })] });
  assert.ok(!has(validate(utf), /Non-ASCII/));
  const cjk = doc({ header: HDR.replace("ENCODING:USASCII", "ENCODING:UTF-8"), trns: [trn({ NAME: "日本" })] });
  assert.ok(has(validate(cjk), /outside Windows-1252/));
});

test("long NAME and MEMO are reported and left alone", () => {
  const src = doc({ trns: [trn({ NAME: "N".repeat(40), MEMO: "M".repeat(300) })] });
  const r = validate(src);
  assert.ok(has(r, /NAME longer than 32/) && has(r, /MEMO longer than 255/));
  assert.equal(repair(src).text, src);
});

test("BOM is reported and stripped", () => {
  const src = "﻿" + doc();
  assert.ok(has(validate(src), /Byte order mark/));
  const f = repair(src);
  assert.ok(!f.text.startsWith("﻿"));
  assert.ok(f.changes.some((c) => /byte order mark/.test(c)));
  assert.equal(validate(f.text).summary.errors, 0);
});

test("decodeBuffer keeps a UTF-8 BOM and falls back to Windows-1252", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]).buffer), "﻿A");
  assert.equal(decodeBuffer(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer), "Café");
});

test("no root, empty, and no transactions", () => {
  assert.ok(has(validate("hello"), /No <OFX> root/));
  assert.ok(has(validate(""), /No <OFX> root/));
  assert.equal(repair("hello").text, "hello");
  assert.ok(has(validate(doc({ trns: [] })), /No transactions/));
});

test("line numbers point at the offending line", () => {
  const src = doc({ trns: [trn({ NAME: "A&B" })] });
  const r = validate(src);
  const f = r.findings.find((x) => /Unescaped &/.test(x.title));
  assert.equal(src.split("\n")[f.line - 1].includes("A&B"), true);
});

test("repair: a file with nothing to fix comes back byte for byte, and the diff shows exactly the changes", () => {
  const clean = doc();
  const r = repair(clean);
  assert.equal(r.text, clean);
  assert.deepEqual(r.changes, []);
  const src = doc({ trns: [trn({ NAME: "A&B", DTPOSTED: "2024-03-04" })] });
  const fx = repair(src);
  const d = diffLines(src, fx.text);
  assert.deepEqual(d.filter((l) => l.startsWith("-")), ["- <DTPOSTED>2024-03-04", "- <NAME>A&B"]);
  assert.deepEqual(d.filter((l) => l.startsWith("+")), ["+ <DTPOSTED>20240304", "+ <NAME>A&amp;B"]);
});

test("CRLF files keep CRLF through repair", () => {
  const src = doc({ trns: [trn({ NAME: "A&B" })] }).replace(/\n/g, "\r\n");
  const out = repair(src).text;
  assert.ok(!/[^\r]\n/.test(out));
  assert.ok(out.includes("A&amp;B"));
});

test("findingsCsv quotes fields and flags auto-fixable rows", () => {
  const csv = findingsCsv(validate(doc({ trns: [trn({ NAME: "A&B" })] })));
  assert.match(csv, /^severity,line,title,detail,auto_fixed\r\n/);
  assert.match(csv, /"Unescaped & in a value".*,yes\r\n/);
});

test("summary uses exact decimal sums", () => {
  const r = validate(doc({ trns: [trn({ FITID: "1", TRNAMT: "0.10", TRNTYPE: "OTHER" }), trn({ FITID: "2", TRNAMT: "0.20", TRNTYPE: "OTHER" })] }));
  assert.equal(r.summary.total, "0.30");
});
