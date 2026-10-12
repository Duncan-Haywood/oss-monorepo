import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseXml, parseAmount, fmtAmount, toCsv, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer, looksLikeMt940 } from "./calc.mjs";

const by = (r, t) => r.findings.find((f) => f.title.startsWith(t));

test("the clean sample has no findings and balances exactly", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.transactions, 3);
  assert.equal(r.summary.statements, 1);
  assert.deepEqual(r.summary.currencies, ["EUR"]);
  assert.equal(fmtAmount(r.summary.credits), "2500.00");
  assert.equal(fmtAmount(r.summary.debits), "-62.09");
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile());
  const bal = by(r, "Balances do not add up");
  assert.match(bal.detail, /difference 42\.10/);
  assert.ok(bal.line > 2, "line points at the closing balance, not the file's first line");
  assert.equal(by(r, "Statement does not continue").severity, "error");
  assert.match(by(r, "Statement does not continue").detail, /3500\.00.*3437\.91/);
  assert.match(by(r, "Batch lines do not add up").detail, /difference 1\.00/);
  assert.ok(by(r, "Looks like a repeat"));
  assert.ok(by(r, "Entry has no booking date"));
  assert.ok(by(r, "Entry count does not match"));
  assert.equal(r.summary.errors, 3);
});

test("amounts are exact: five decimals read, separators refused", () => {
  assert.equal(parseAmount("1234.56"), 123456000);
  assert.equal(parseAmount("0.00001"), 1);
  assert.equal(parseAmount("12"), 1200000);
  assert.equal(parseAmount("1,234.56"), null);
  assert.equal(parseAmount("12,50"), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(fmtAmount(-4210000), "-42.10");
});

test("a comma decimal in an amount is an error, not silently read", () => {
  const xml = sampleFile().replace(">42.10<", ">42,10<");
  const r = validate(xml);
  assert.ok(by(r, "Entry amount is not a number"));
});

test("a reversal flips the sign of its entry", () => {
  const xml = sampleFile().replace("<CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2024-01-02", "<CdtDbtInd>DBIT</CdtDbtInd><RvslInd>true</RvslInd><Sts>BOOK</Sts><BookgDt><Dt>2024-01-02");
  const r = validate(xml);
  assert.equal(r.transactions[0].signed, 4210000);
  assert.ok(by(r, "Balances do not add up"));
});

test("pending entries are not counted in the balance", () => {
  const xml = sampleFile().replace(/<Sts>BOOK<\/Sts>(<BookgDt><Dt>2024-01-20)/, "<Sts>PDNG</Sts>$1");
  const r = validate(xml);
  assert.ok(by(r, "Balances do not add up"), "removing a booked entry from the sum unbalances it");
  assert.ok(!by(r, "Entry has no status"));
});

test("an entry in another currency is flagged and left out of the sum", () => {
  const xml = sampleFile().replace('<Amt Ccy="EUR">19.99</Amt><CdtDbtInd>DBIT', '<Amt Ccy="USD">19.99</Amt><CdtDbtInd>DBIT');
  assert.ok(by(validate(xml), "Entry currency differs"));
});

test("a booking date outside the stated period is a warning", () => {
  const xml = sampleFile().replace("<Dt>2024-01-15</Dt></BookgDt>", "<Dt>2024-03-15</Dt></BookgDt>");
  assert.ok(by(validate(xml), "Booking date is outside"));
});

test("an impossible date is an error", () => {
  const xml = sampleFile().replace("<Dt>2024-01-15</Dt></BookgDt>", "<Dt>2024-13-45</Dt></BookgDt>");
  assert.ok(by(validate(xml), "Impossible booking date"));
});

test("a missing closing balance and a missing indicator are errors", () => {
  const noClose = sampleFile().replace(/<Bal><Tp><CdOrPrtry><Cd>CLBD[\s\S]*?<\/Bal>/, "");
  assert.ok(by(validate(noClose), "No closing balance"));
  const noInd = sampleFile().replace("<CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01", "<CdtDbtInd></CdtDbtInd><Dt><Dt>2024-01-01");
  assert.ok(by(validate(noInd), "Balance OPBD has no CRDT"));
});

test("a cut-off file is reported with the line of the unclosed element", () => {
  const xml = sampleFile().split("\n").slice(0, 8).join("\n");
  const r = validate(xml);
  assert.match(r.findings[0].title, /not well formed/);
  assert.ok(r.findings[0].line > 1);
});

test("a mismatched closing tag names both tags", () => {
  const p = parseXml("<a>\n<b>\n</c>\n</a>");
  assert.match(p.error.msg, /<\/c>.*<b>/);
  assert.equal(p.error.line, 3);
});

test("entities, CDATA, comments and namespace prefixes are read", () => {
  const p = parseXml(`<ns:a xmlns:ns="u"><!-- c --><ns:b x="1&amp;2">A &amp; B</ns:b><ns:c><![CDATA[<raw>]]></ns:c></ns:a>`);
  assert.equal(p.error, null);
  assert.equal(p.root.children[0].text, "A & B");
  assert.equal(p.root.children[0].attrs.x, "1&2");
  assert.equal(p.root.children[1].text, "<raw>");
});

test("an MT940 file is named as such", () => {
  const mt = ":20:A\n:25:X\n:60F:C240101EUR0,00\n:62F:C240131EUR0,00\n-\n";
  assert.ok(looksLikeMt940(mt));
  assert.match(validate(mt).findings[0].title, /MT940/);
});

test("camt.052 and camt.054 are named, not reported as broken statements", () => {
  const x = `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.052.001.02"><BkToCstmrAcctRpt><Rpt/></BkToCstmrAcctRpt></Document>`;
  assert.match(validate(x).findings[0].title, /camt\.052/);
});

test("text that is not a statement gives one clear error", () => {
  const r = validate("hello world");
  assert.equal(r.summary.errors, 1);
  assert.equal(r.summary.statements, 0);
});

test("a missing namespace is a warning, not an error", () => {
  const r = validate(sampleFile().replace(' xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"', ""));
  assert.ok(by(r, "No xmlns"));
  assert.equal(r.summary.errors, 0);
});

test("a counterparty is the debtor on a credit and the creditor on a debit", () => {
  const r = validate(sampleFile());
  assert.equal(r.transactions[0].name, "Office Supplies BV");
  assert.equal(r.transactions[1].name, "Client One BV");
  assert.equal(r.transactions[0].typeCode, "PMNT-ICDT-ESCT");
});

test("CSV has a signed amount, one row per entry, and honours a comma decimal", () => {
  const r = validate(sampleFile());
  const rows = toCsv(r).trim().split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[1], /"-42\.10"/);
  assert.match(toCsv(r, { decimal: "," }).split("\r\n")[1], /"-42,10"/);
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,problem/);
});

test("decodeBuffer reads UTF-8, UTF-16 and falls back to Windows-1252", () => {
  assert.equal(decodeBuffer(new TextEncoder().encode("<a>É</a>")), "<a>É</a>");
  assert.equal(decodeBuffer(new Uint8Array([0x3c, 0xe9])), "<é");
});

test("repair fixes only comma decimals and bare ampersands, and never touches a total", () => {
  const xml = sampleFile().replace(/<Nm>[^<]*<\/Nm>/, "<Nm>Smith & Sons</Nm>").replace(/<Amt Ccy="EUR">1000\.00/, '<Amt Ccy="EUR">1000,00');
  assert.ok(validate(xml).findings.some((f) => f.title.startsWith("Unescaped &")));
  const { text, changes } = repair(xml);
  assert.equal(changes.length, 2);
  assert.match(text, /Smith &amp; Sons/);
  assert.doesNotMatch(text, /1000,00/);
  assert.deepEqual(validate(text).findings, []);
  assert.deepEqual(repair(sampleFile()).changes, []);
  assert.match(repair("<A><![CDATA[a & b]]></A>").text, /a & b/);
  const off = sampleFile().replace("3437.91", "3400,00");
  assert.ok(validate(repair(off).text).findings.some((f) => f.title.startsWith("Balances do not add up")), "totals are never guessed");
});
