import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeBytes } from "./textcodec.mjs";
import { readStatement } from "./bank.mjs";
import { statementTextFromFile } from "./ocr.mjs";

const csv = readFileSync(new URL("./fixtures/revolut-current.csv", import.meta.url), "utf8");
const utf16le = (s, bom = true) => Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(s, "utf16le")]);
const utf16be = (s, bom = true) => { const le = Buffer.from(s, "utf16le"); for (let i = 0; i < le.length; i += 2) [le[i], le[i + 1]] = [le[i + 1], le[i]]; return Buffer.concat([bom ? Buffer.from([0xfe, 0xff]) : Buffer.alloc(0), le]); };
const rows = (t) => readStatement(t).rows.map((r) => `${r.date} ${r.cents}`);

test("UTF-16 LE/BE with and without a BOM decode to the same statement", () => {
  const want = rows(csv);
  assert.ok(want.length >= 3);
  for (const b of [utf16le(csv), utf16le(csv, false), utf16be(csv), utf16be(csv, false)]) assert.deepEqual(rows(decodeBytes(b)), want);
});

test("UTF-8 with a BOM loses the BOM; plain UTF-8 keeps accents", () => {
  assert.equal(decodeBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Café")])), "Café");
  assert.equal(decodeBytes(Buffer.from("Café — €5")), "Café — €5");
});

test("Windows-1252 bytes (not valid UTF-8) fall back instead of becoming U+FFFD", () => {
  assert.equal(decodeBytes(Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x35])), "Café €5");
});

test("a UTF-16 file on disk imports through the CLI's file reader", () => {
  const dir = mkdtempSync(join(tmpdir(), "codec-"));
  const f = join(dir, "excel-unicode.csv");
  writeFileSync(f, utf16le(csv.replace(/\n/g, "\r\n")));
  assert.deepEqual(rows(statementTextFromFile(f)), rows(csv));
});

test("a LITAS-ESIS .acc file in Windows-1257 is recognised without a flag", () => {
  const line = "000\t20240102\t1\n010\t20240102\t12.50\tD\tUAB Šiaulių žuvis\tPirkinys\n";
  const bytes = new Uint8Array(line.length);
  const map = { "Š": 0xd0, "ž": 0xfe, "ų": 0xf8, "ė": 0xeb };
  [...line].forEach((c, i) => { bytes[i] = map[c] ?? c.charCodeAt(0); });
  const text = decodeBytes(bytes);
  assert.match(text, /Šiaulių žuvis/);
});

test("Windows-1251 Cyrillic is told from Windows-1252; an explicit encoding wins", () => {
  // 1251: capitals from 0xc0, lower case from 0xe0
  const enc = (s) => Uint8Array.from([...s].map((c) => (c === " " ? 0x20 : c >= "а" ? c.charCodeAt(0) - 0x430 + 0xe0 : c.charCodeAt(0) - 0x410 + 0xc0)));
  assert.equal(decodeBytes(enc("Привет мир платеж оплата")), "Привет мир платеж оплата");
  assert.equal(decodeBytes(enc("Привет"), "windows-1251"), "Привет");
  // Western text with an accent stays 1252
  assert.equal(decodeBytes(Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x62, 0x61, 0x72])), "Café bar");
});

test("Windows-1257 and Windows-1250 text is told from Windows-1252 by its letters", () => {
  const enc = (map, s) => Buffer.from([...s].map((c) => map[c] ?? c.charCodeAt(0)));
  const lt = { "ą": 0xe0, "č": 0xe8, "ė": 0xeb, "š": 0xf0, "ž": 0xfe, "ų": 0xf8, "ū": 0xfb, "Š": 0xd0, "į": 0xe1 };
  const cz = { "ě": 0xec, "š": 0x9a, "č": 0xe8, "ř": 0xf8, "ž": 0x9e, "ů": 0xf9, "ý": 0xfd, "á": 0xe1, "Ř": 0xd8, "é": 0xe9, "í": 0xed };
  for (const s of ["Mokėjimas už šviežią žuvį", "Pavedimas: Šiaulių gatvė 5, Vilnius, čekis"]) assert.equal(decodeBytes(enc(lt, s)), s);
  for (const s of ["Platba za čerstvé zboží, Řeřicha", "Poplatek ěščřžýáí"]) assert.equal(decodeBytes(enc(cz, s)), s);
  assert.equal(decodeBytes(Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72])), "Café Müller");
});
