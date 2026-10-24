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
// Legacy code pages other than 1252 (bytes built by hand from the code-page
// tables; made-up rows, no real bank file).
const enc = (map, text) => Uint8Array.from([...text].map((ch) => map[ch] ?? ch.charCodeAt(0)));
test("windows-1257 Lithuanian header and purpose text", () => {
  const m = { "š": 0xf0, "ž": 0xfe, "ė": 0xeb, "č": 0xe8, "ų": 0xf8 };
  const text = "Data;Suma;Paaiškinimai\n2026.03.01;-12,50;Mokėjimas už prekes čekis ų ž\n";
  assert.equal(decodeBytes(enc(m, text)), text);
});
test("windows-1250 Polish and Czech text", () => {
  const pl = { "ą": 0xb9, "ł": 0xb3, "ż": 0xbf, "ś": 0x9c, "ć": 0xe6 };
  const t1 = "Opis;Kwota\nZakup w sklepie łąka;-10,00\n";
  assert.equal(decodeBytes(enc(pl, t1)), t1);
  const cz = { "Č": 0xc8, "ě": 0xec, "ř": 0xf8, "č": 0xe8, "š": 0x9a };
  const t2 = "Popis;Částka\nPřevod věřiteli;-100,00\n";
  assert.equal(decodeBytes(enc(cz, t2)), t2);
});
test("1252 stays the default: Danish, Italian, Icelandic, French", () => {
  const w = { "æ": 0xe6, "ø": 0xf8, "å": 0xe5, "è": 0xe8, "ì": 0xec, "ù": 0xf9, "ð": 0xf0, "þ": 0xfe, "á": 0xe1, "í": 0xed, "é": 0xe9, "ç": 0xe7 };
  for (const t of ["Købmand ærø åben\n", "così è più\n", "Þórður Ásgeirsson á leið í bæinn með ð\n", "Café français ç\n"])
    assert.equal(decodeBytes(enc(w, t)), t);
});

test("windows-1250 is chosen on s/z with caron, which Western bank text lacks", () => {
  const m = { "č": 0xe8, "š": 0x9a, "ž": 0x9e, "Š": 0x8a, "ť": 0x9d, "ý": 0xfd };
  const text = "Datum;Částka;Popis\n2026.03.01;-120,00;Platba kartou Šmíd žaluzie Praha\n";
  const c = { ...m, "Č": 0xc8, "á": 0xe1, "í": 0xed };
  assert.equal(decodeBytes(enc(c, text)), text);
});
test("French and Italian accents stay windows-1252", () => {
  const m = { "è": 0xe8, "é": 0xe9, "ù": 0xf9 };
  const text = "Date;Libellé;Montant\n2026.03.01;Café où l'été è;-4,50\n";
  assert.equal(decodeBytes(enc(m, text)), text);
});
