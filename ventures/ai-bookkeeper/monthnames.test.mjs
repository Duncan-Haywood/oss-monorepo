import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, readStatement } from "./bank.mjs";

test("month names in German, French, Spanish, Italian, Dutch and Portuguese", () => {
  const cases = {
    "1. März 2026": "2026-03-01", "9 dez 2026": "2026-12-09", "7 Okt. 2026": "2026-10-07",
    "3 déc. 2025": "2025-12-03", "14 juil. 2026": "2026-07-14", "14 juin 2026": "2026-06-14",
    "4 sept. 2026": "2026-09-04", "2 févr. 2026": "2026-02-02", "5 août 2026": "2026-08-05",
    "12 de marzo de 2026": "2026-03-12", "30 ene 2026": "2026-01-30", "8 dic 2026": "2026-12-08",
    "31 gen 2026": "2026-01-31", "15 ago 2026": "2026-08-15", "3 mag 2026": "2026-05-03", "9 lug 2026": "2026-07-09",
    "5 mrt 2026": "2026-03-05", "2 mei 2026": "2026-05-02", "6 out 2026": "2026-10-06",
    "Mar 9, 2026": "2026-03-09", "12 Mar 2026": "2026-03-12",
  };
  for (const [text, iso] of Object.entries(cases)) assert.equal(parseDate(text), iso, text);
  assert.equal(parseDate("1 foo 2026"), null);
  assert.equal(parseDate("31 feb 2026"), null);
});

test("a German statement with text-month dates imports end to end", () => {
  const csv = "Buchungstag;Verwendungszweck;Betrag\n3. März 2026;Miete Büro;-950,00\n14. Okt. 2026;Kunde Rechnung 12;1.200,50\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-03", "2026-10-14"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-95000, 120050]);
});
