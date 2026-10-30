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

// Layouts read off the MIT tariochbctools importers and its PostFinance test
// (cloned at run time, nothing copied); the rows are made up.
test("PostFinance English and French headers: text column read, debit already negative, balance kept", () => {
  const en = readStatement([
    "Booking date;Notification text;Credit in CHF;Debit in CHF;Value;Balance in CHF",
    '31.12.2022;"Preis für Bankpaket Smart";;-5;31.12.2022;7881.98',
    '30.12.2022;"Gutschrift Lohn";2500.00;;30.12.2022;7886.98',
  ].join("\n"));
  assert.deepEqual(en.rows.map((x) => [x.desc, x.cents, x.balance]), [
    ["Preis für Bankpaket Smart", -500, 788198], ["Gutschrift Lohn", 250000, 788698]]);
  const fr = readStatement([
    "Date de comptabilisation;Libellé;Crédit en CHF;Débit en CHF;Date de valeur;Solde en CHF",
    '31.12.2022;"Prix du forfait";;-5;31.12.2022;7881.98',
    '30.12.2022;"Salaire";2500.00;;30.12.2022;7886.98',
  ].join("\n"));
  assert.deepEqual(fr.rows.map((x) => [x.cents, x.balance]), [[-500, 788198], [250000, 788698]]);
});

test("Swisscard cashback CSV lists charges as positive: signs flipped without a payment row", () => {
  const r = readStatement([
    "Transaction date,Description,Amount,Currency,Status,Merchant Category,Registered Category",
    "03.01.2023,Migros Bern,45.20,CHF,Posted,Supermarkets,Groceries",
    "05.01.2023,Refund Zalando,-20.00,CHF,Posted,Clothing,Shopping",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2023-01-03", -4520], ["2023-01-05", 2000]]);
});
