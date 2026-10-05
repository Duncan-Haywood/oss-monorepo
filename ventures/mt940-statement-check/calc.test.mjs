import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseMt940, parseInfo, parseAmount, fmtAmount, toCsv, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer, looksLikeCamt } from "./calc.mjs";

const by = (r, t) => r.findings.find((f) => f.title.startsWith(t));

test("the clean sample has no findings and balances to the cent", () => {
  const r = validate(sampleFile());
  assert.equal(r.findings.length, 0);
  assert.equal(r.summary.transactions, 3);
  assert.equal(r.summary.statements, 1);
  assert.deepEqual(r.summary.currencies, ["EUR"]);
  assert.equal(fmtAmount(r.summary.credits), "2500.00");
  assert.equal(fmtAmount(r.summary.debits), "-62.09");
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile());
  assert.equal(by(r, "Balance uses a period").line, 4);
  assert.equal(by(r, "Balances do not add up").line, 12);
  assert.match(by(r, "Balances do not add up").detail, /difference is 4\.19/);
  assert.equal(by(r, "Statement does not continue").severity, "error");
  assert.equal(by(r, "Looks like a repeat").line, 7);
  assert.equal(by(r, "Transaction has no :86:").line, 9);
  assert.equal(r.findings.filter((f) => f.title.startsWith("No closing -")).length, 2);
});

test("amounts are exact: comma and period read, three-decimal currencies survive", () => {
  assert.equal(parseAmount("1234,56"), 1234560);
  assert.equal(parseAmount("0,1"), 100);
  assert.equal(parseAmount("12"), 12000);
  assert.equal(parseAmount("1.234,56"), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(fmtAmount(-42100), "-42.10");
  assert.equal(fmtAmount(1234567), "1234.567");
});

test("debit, credit and reversal signs", () => {
  const t = (dc) => `:20:A\n:25:X\n:60F:C240101EUR0,00\n:61:240102${dc}10,00NTRFREF\n:62F:C240131EUR0,00\n-\n`;
  const sign = (dc) => validate(t(dc)).transactions[0].signed;
  assert.equal(sign("C"), 10000);
  assert.equal(sign("D"), -10000);
  assert.equal(sign("RD"), 10000);
  assert.equal(sign("RC"), -10000);
});

test("entry date takes the nearest year to the value date across new year", () => {
  const s = `:20:A\n:25:X\n:60F:C231229EUR0,00\n:61:2401020102D1,00NTRFREF\n:61:2312300102D1,00NTRFREF2\n:62F:D240102EUR2,00\n-\n`;
  const r = validate(s);
  assert.equal(r.transactions[0].entry, "2024-01-02");
  assert.equal(r.transactions[1].entry, "2024-01-02");
  assert.equal(r.transactions[1].value, "2023-12-30");
});

test("an unreadable :61: and an impossible date are errors", () => {
  const s = `:20:A\n:25:X\n:60F:C240101EUR0,00\n:61:garbage\n:61:2413010101D1,00NTRFREF\n:62F:C240131EUR0,00\n-\n`;
  const r = validate(s);
  assert.ok(by(r, "Transaction line (:61:) cannot be read"));
  assert.ok(by(r, "Impossible value date"));
});

test("a CAMT file is named as such, not as a broken MT940", () => {
  const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt/></Document>`;
  assert.ok(looksLikeCamt(xml));
  const r = validate(xml);
  assert.match(r.findings[0].title, /CAMT/);
  assert.equal(r.summary.transactions, 0);
});

test("text with no statement gives one clear error", () => {
  const r = validate("hello world");
  assert.equal(r.summary.errors, 1);
  assert.match(r.findings[0].title, /No MT940/);
});

test("SWIFT block wrappers are ignored and -} terminates", () => {
  const s = `{1:F01BANKNL2AAXXX0000000000}{2:O9401200240102BANKNL2AAXXX00000000002401021201N}{4:\n:20:A\n:25:X\n:28C:1/1\n:60F:C240101EUR1,00\n:62F:C240131EUR1,00\n-}\n`;
  const r = validate(s);
  assert.equal(r.findings.length, 0);
});

test(":86: is split into labelled parts in both common layouts", () => {
  const a = parseInfo("/EREF/E1/NAME/Jo Smith/REMI/Invoice 7");
  assert.equal(a.name, "Jo Smith");
  assert.equal(a.description, "Jo Smith — Invoice 7");
  const b = parseInfo("020?20Rent?21February?32Landlord BV");
  assert.equal(b.name, "Landlord BV");
  assert.equal(b.description, "Landlord BV — Rent February");
  assert.equal(parseInfo("plain text").description, "plain text");
});

test("a multi-line :86: continues onto its following lines", () => {
  const s = `:20:A\n:25:X\n:28C:1/1\n:60F:C240101EUR0,00\n:61:240102D1,00NTRFREF\n:86:/NAME/Jo\nSmith/REMI/rent\n:62F:D240131EUR1,00\n-\n`;
  const r = validate(s);
  assert.equal(r.findings.length, 0);
  assert.equal(parseMt940(s).statements[0].tags[5].extra.length, 1);
});

test("repair writes commas, adds the - line, and the result validates clean of those findings", () => {
  const fixed = repair(sampleBrokenFile());
  assert.equal(fixed.changes.length, 3);
  const r = validate(fixed.text);
  assert.ok(!by(r, "Balance uses a period"));
  assert.ok(!by(r, "No closing -"));
  assert.ok(by(r, "Balances do not add up"), "a wrong total is never silently changed");
});

test("repair of a clean file changes nothing", () => {
  assert.equal(repair(sampleFile()).changes.length, 0);
});

test("CSV has a signed amount, one row per transaction, and honours a comma decimal", () => {
  const r = validate(sampleFile());
  const rows = toCsv(r).trim().split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[1], /"-42\.10"/);
  assert.match(toCsv(r, { decimal: "," }).split("\r\n")[1], /"-42,10"/);
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,problem/);
});

test("a statement cut off before the closing balance is an error", () => {
  const s = `:20:A\n:25:X\n:60F:C240101EUR0,00\n:61:240102D1,00NTRFREF\n:86:x\n`;
  assert.ok(by(validate(s), "No closing balance"));
});

test("decodeBuffer reads UTF-8, UTF-16 and falls back to Windows-1252", () => {
  assert.equal(decodeBuffer(new TextEncoder().encode(":20:É")), ":20:É");
  assert.equal(decodeBuffer(new Uint8Array([0x3a, 0xe9])), ":é");
});
