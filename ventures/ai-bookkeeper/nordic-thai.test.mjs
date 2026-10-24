import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Headers as I remember Nordic, Thai and Icelandic bank exports; every row is
// made up, so none of this is a real bank download.
const out = (r) => r.rows.map((x) => [x.date, x.cents, x.desc]);

test("Swedish Bokföringsdag / Referens / Insättning/Uttag", () => {
  const r = readStatement("Bokföringsdag;Valutadag;Referens;Insättning/Uttag;Saldo\n2026-03-05;2026-03-05;ICA MAXI;-540,25;9 459,75\n2026-03-06;2026-03-06;Lön;25 000,00;34 459,75");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -54025, "ICA MAXI"], ["2026-03-06", 2500000, "Lön"]]);
});

test("Norwegian Dato / Ut fra konto / Inn på konto sign without a warning", () => {
  const r = readStatement("Dato;Forklaring;Rentedato;Ut fra konto;Inn på konto\n05.03.2026;REMA 1000;05.03.2026;540,25;\n06.03.2026;Lønn;06.03.2026;;25 000,00");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -54025, "REMA 1000"], ["2026-03-06", 2500000, "Lønn"]]);
});

test("Danish Dato;Tekst;Beløb;Saldo", () => {
  const r = readStatement("Dato;Tekst;Beløb;Saldo\n05.03.2026;Netto;-540,25;9.459,75\n06.03.2026;Løn;25.000,00;34.459,75");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(out(r), [["2026-03-05", -54025, "Netto"], ["2026-03-06", 2500000, "Løn"]]);
});

test("Thai headers read dates day first (05/03 is 5 March)", () => {
  const r = readStatement("วันที่,รายการ,ถอน,ฝาก,คงเหลือ\n05/03/2026,ซื้อของ,540.25,,9459.75\n06/03/2026,เงินเดือน,,25000.00,34459.75");
  assert.deepEqual(out(r), [["2026-03-05", -54025, "ซื้อของ"], ["2026-03-06", 2500000, "เงินเดือน"]]);
});

test("Icelandic Dagsetning / Skýring / Upphæð / Staða", () => {
  const r = readStatement("Dagsetning;Skýring;Upphæð;Staða\n05.03.2026;Bónus;-540;9459");
  assert.deepEqual(out(r), [["2026-03-05", -54000, "Bónus"]]);
});
