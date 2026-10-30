// ING (Germany) "Umsatzanzeige" CSV layout, seen in the inline test data of siddhantgoel/beancount-ing (MIT; layout only, every row here is made up): the payee column is "Auftraggeber/Empfänger", which was not recognised, so the payee was dropped from the description.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const csv = [
  "Umsatzanzeige;Datei erstellt am: 25.07.2018 12:00", ";Letztes Update: aktuell", "",
  "IBAN;DE99 9999 9999 9999 9999 99", "Kontoname;Extra-Konto", "Bank;ING", "Zeitraum;01.06.2018 - 30.06.2018", "Saldo;5.000,00;EUR", "",
  '"Buchung";"Valuta";"Auftraggeber/Empfänger";"Buchungstext";"Verwendungszweck";"Saldo";"Währung";"Betrag";"Währung"',
  "08.06.2018;08.06.2018;REWE Filialen Voll;Gutschrift;REWE SAGT DANKE;1.234,00;EUR;500,00;EUR",
  "07.06.2018;07.06.2018;Miete Vermieter;Lastschrift;Miete Juni;734,00;EUR;-900,00;EUR",
].join("\n");

test("ING Auftraggeber/Empfänger is the payee and leads the description", () => {
  const { rows, problems } = readStatement(csv);
  assert.deepEqual(rows.map((r) => [r.date, r.cents, r.desc]), [
    ["2018-06-08", 50000, "REWE Filialen Voll - REWE SAGT DANKE"],
    ["2018-06-07", -90000, "Miete Vermieter - Miete Juni"],
  ]);
  assert.deepEqual(problems, []);
});
