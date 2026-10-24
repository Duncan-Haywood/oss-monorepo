import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBytes } from "./textcodec.mjs";
import { readStatement } from "./bank.mjs";

// Bytes are built by encoding made-up text with each codepage's own table; no
// real bank file was tried.
function encode(text, codepage) {
  const d = new TextDecoder(codepage);
  const table = new Map();
  for (let i = 0; i < 256; i++) { const c = d.decode(new Uint8Array([i])); if (c !== "�") table.set(c, i); }
  return Uint8Array.from([...text], (ch) => table.get(ch));
}

const files = {
  "windows-1251": "Дата операции;Описание;Расход;Приход;Остаток\n05.03.2026;Пятёрочка;540,00;;9460,00\n06.03.2026;Зарплата;;10000,00;19460,00\n",
  "windows-1255": "תאריך,תיאור,חובה,זכות,יתרה\n05/03/2026,סופר פארם,54.00,,946.00\n06/03/2026,משכורת,,1000.00,1946.00\n",
  "windows-1253": "Ημερομηνία;Περιγραφή;Χρέωση;Πίστωση;Υπόλοιπο\n05/03/2026;ΣΚΛΑΒΕΝΙΤΗΣ;54,00;;946,00\n06/03/2026;ΜΙΣΘΟΔΟΣΙΑ;;1000,00;1946,00\n",
};

for (const [codepage, text] of Object.entries(files)) {
  test(`${codepage} file is detected without a flag and reads day first`, () => {
    const decoded = decodeBytes(encode(text, codepage));
    assert.equal(decoded, text);
    const r = readStatement(decoded);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-06"]);
    assert.ok(r.rows[0].cents < 0 && r.rows[1].cents > 0);
  });
}
