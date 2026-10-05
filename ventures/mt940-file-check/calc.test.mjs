import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseMt940, toMilli, fmtMilli, transliterate, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const titles = (r) => r.findings.map((f) => f.title);

test("the clean sample has no findings and repairs to itself", () => {
  const r = validate(sampleFile());
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.transactions, 2);
  assert.deepEqual(repair(sampleFile(), { transliterate: true }).changes, []);
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile());
  const by = (t) => r.findings.find((f) => f.title.startsWith(t));
  assert.equal(by("Balance does not add up").line, 11);
  assert.match(by("Balance does not add up").detail, /Off by -1500,/);
  assert.equal(by("Opening balance does not continue").line, 15);
  assert.equal(by(":61: value date is not a real date").line, 16);
  assert.equal(by("Looks like a repeat").line, 9);
  assert.ok(by("Characters outside"));
  assert.ok(by("No - line"));
  assert.equal(r.findings.filter((f) => f.title.endsWith("amount has no comma")).length, 2);
});

test("repair fixes dots, the closing - and, only on request, non-SWIFT characters; never balances", () => {
  const a = repair(sampleBrokenFile());
  assert.ok(a.text.includes(":60F:C240101EUR1000,00"));
  assert.ok(a.text.includes("D42,10NTRF"));
  assert.ok(a.text.includes("Müller"));
  assert.equal(a.text.split("\n").filter((l) => l === "-").length, 1);
  const b = repair(sampleBrokenFile(), { transliterate: true });
  assert.ok(b.text.includes("Mueller & Soehne"));
  assert.ok(b.text.includes(":62F:C240131EUR2457,90"));
  assert.ok(!titles(validate(b.text)).some((t) => t.includes("comma")));
});

test("amounts: comma parsing, signs and reversals", () => {
  assert.equal(toMilli("1234,56"), 1234560n);
  assert.equal(toMilli("100,"), 100000n);
  assert.equal(toMilli("1.5"), null);
  assert.equal(fmtMilli(-2457900n), "-2457,90");
  const t = `:20:A\n:25:X\n:28C:1\n:60F:C240101EUR100,00\n:61:2401020102RC10,00NTRFREF\n:62F:C240131EUR90,00\n`;
  assert.equal(validate(t).summary.errors, 0);
});

test("a whole amount with no decimals needs the trailing comma", () => {
  const t = `:20:A\n:25:X\n:28C:1\n:60F:C240101JPY1000,\n:61:240102D500NTRFREF\n:62F:C240131JPY500,\n-\n`;
  const r = validate(t);
  assert.ok(titles(r).includes(":61: amount has no comma"));
  assert.equal(r.findings.find((f) => f.title.startsWith("Balance")), undefined);
  assert.ok(repair(t).text.includes("D500,NTRF"));
});

test("missing mandatory tags are named", () => {
  const r = validate(`:20:A\n:61:240102D5,NTRFREF\n`);
  const t = titles(r).join("|");
  assert.match(t, /Missing :25:/);
  assert.match(t, /Missing opening balance/);
  assert.match(t, /Missing closing balance/);
});

test("SWIFT block wrapper and CRLF files parse", () => {
  const body = sampleFile().replace(/\n/g, "\r\n");
  const wrapped = `{1:F01BANKDEFFAXXX0000000000}{2:O9401200240101BANKDEFFAXXX00000000002401011200N}{4:\r\n${body.replace(/-\r\n$/, "")}-}`;
  const r = validate(wrapped);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.transactions, 2);
});

test("camt XML, empty and non-MT940 input get a plain answer", () => {
  assert.match(validate("<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:camt.053.001.02\"></Document>").findings[0].title, /camt/);
  assert.equal(validate("").findings[0].title, "The file is empty");
  assert.equal(validate("hello world").findings[0].title, "No MT940 tags found");
});

test("long :20: reference and over-long :86: lines are flagged", () => {
  const t = `:20:ABCDEFGHIJKLMNOPQ\n:25:X\n:28C:1\n:60F:C240101EUR1,00\n:61:240102D1,NTRFREF\n:86:${"x".repeat(70)}\n:62F:D240131EUR0,00\n`;
  const r = validate(t);
  assert.ok(titles(r).some((x) => x.includes("longer than 16")));
  assert.ok(titles(r).includes("Line longer than 65 characters"));
});

test("transliteration and findings CSV", () => {
  assert.equal(transliterate("Müller Ärger Straße café €5"), "Mueller Aerger Strasse cafe EUR5");
  assert.equal(transliterate("a\nb"), "a\nb");
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,problem/);
});

test("windows-1252 bytes decode to umlauts", () => {
  assert.equal(decodeBuffer(new Uint8Array([0x4d, 0xfc, 0x6c]).buffer), "Mül");
  assert.deepEqual(parseMt940(sampleFile()).statements.length, 1);
});
