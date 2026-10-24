import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// PostFinance-style German-language CSV as I remember it; rows are made up,
// so this is not a real bank download.
const pf = [
  "Buchungsdatum;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;Valuta;Saldo in CHF",
  "2026-03-15;Coop Zürich;;45.20;2026-03-15;954.80",
  "2026-03-12;Kunde AG;1'000.00;;2026-03-12;1'000.00",
].join("\n");

test("Swiss Gutschrift/Lastschrift columns sign the amounts and the text column is the description", () => {
  const r = readStatement(pf);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc, x.balance]), [
    ["2026-03-15", -4520, "Coop Zürich", 95480],
    ["2026-03-12", 100000, "Kunde AG", 100000],
  ]);
});
