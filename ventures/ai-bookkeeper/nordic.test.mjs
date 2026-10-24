import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts written from the column names Swedish, Danish and Norwegian bank
// exports are known to use (Bokföringsdatum/Text/Belopp, Dato/Tekst/Beløb,
// Ut fra konto/Inn på konto). Rows made up; no real export tried.
test("Swedish semicolon CSV: Bokföringsdatum, Text, Belopp, Saldo", () => {
  const r = readStatement("Bokföringsdatum;Transaktionsdatum;Text;Belopp;Saldo\n2026-01-05;2026-01-04;ICA Maxi;-459,50;10540,50\n2026-01-09;2026-01-09;Lön Acme AB;25000,00;35540,50\n");
  assert.deepEqual(r.problems.filter((p) => !/read/.test(p)), []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [["2026-01-05", "ICA Maxi", -45950], ["2026-01-09", "Lön Acme AB", 2500000]]);
});
test("Danish CSV: Dato, Tekst, Beløb", () => {
  const r = readStatement("Dato;Tekst;Beløb;Saldo\n15-01-2026;Netto;-120,00;880,00\n29-01-2026;Løn;5000,00;5880,00\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [["2026-01-15", "Netto", -12000], ["2026-01-29", "Løn", 500000]]);
});
test("Norwegian CSV: Ut fra konto / Inn på konto", () => {
  const r = readStatement("Dato;Forklaring;Ut fra konto;Inn på konto\n05.01.2026;Rema 1000;250,00;\n09.01.2026;Lønn;;30000,00\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [["2026-01-05", "Rema 1000", -25000], ["2026-01-09", "Lønn", 3000000]]);
});
