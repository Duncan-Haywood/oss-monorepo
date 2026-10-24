import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Headers as I remember bank exports; rows are made up, no real file tried.
// Dates are written day first in all four languages; 05.03.26 is 5 March.
const cases = {
  russian: ["Дата операции;Описание;Расход;Приход;Остаток", "05.03.2026;Пятёрочка;540,00;;9460,00", "06.03.2026;Зарплата;;10000,00;19460,00"],
  hebrew: ["תאריך,תיאור,חובה,זכות,יתרה", "05/03/2026,סופר פארם,54.00,,946.00", "06/03/2026,משכורת,,1000.00,1946.00"],
  greek: ["Ημερομηνία;Περιγραφή;Χρέωση;Πίστωση;Υπόλοιπο", "05/03/2026;ΣΚΛΑΒΕΝΙΤΗΣ;54,00;;946,00", "06/03/2026;ΜΙΣΘΟΔΟΣΙΑ;;1000,00;1946,00"],
  vietnamese: ["Ngày giao dịch,Nội dung,Ghi nợ,Ghi có,Số dư", "05/03/2026,Highlands Coffee,54000,,946000", "06/03/2026,Luong,,1000000,1946000"],
};

for (const [lang, lines] of Object.entries(cases)) {
  test(`${lang} debit/credit headers map and dates read day first`, () => {
    const r = readStatement(lines.join("\n"));
    assert.deepEqual(r.problems, []);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-06"]);
    assert.ok(r.rows[0].cents < 0 && r.rows[1].cents > 0);
    assert.ok(r.rows[0].desc.length > 2);
  });
}
