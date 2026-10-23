import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts written from the column names PKO BP, mBank, OP/Nordea (Finland),
// Czech banks and Portuguese/Italian banks are known to use. Rows made up; no
// real export tried.
const flat = (r) => r.rows.map((x) => [x.date, x.desc, x.cents]);
test("PKO BP: Opis transakcji is the description, Data waluty is not the date", () => {
  const r = readStatement("Data operacji,Data waluty,Typ transakcji,Kwota,Waluta,Saldo po transakcji,Opis transakcji\n2026-01-05,2026-01-07,Płatność kartą,-45.90,PLN,1000.00,BIEDRONKA\n2026-01-09,2026-01-09,Przelew przychodzący,2500.00,PLN,3500.00,Wynagrodzenie\n");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(flat(r), [["2026-01-05", "BIEDRONKA", -4590], ["2026-01-09", "Wynagrodzenie", 250000]]);
});
test("mBank: # prefixed headers", () => {
  const r = readStatement("#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;\n2026-01-05;ŻABKA;mKonto;Jedzenie;-45,90;\n");
  assert.deepEqual(flat(r), [["2026-01-05", "ŻABKA", -4590]]);
});
test("Finnish: Kirjauspäivä, Määrä EUROA, Saaja/Maksaja", () => {
  const r = readStatement("Kirjauspäivä;Määrä EUROA;Saaja/Maksaja;Selitys;Viesti\n05.01.2026;-45,90;K-Market;Korttiosto;\n09.01.2026;2500,00;Acme Oy;Palkka;\n");
  assert.deepEqual(flat(r), [["2026-01-05", "K-Market", -4590], ["2026-01-09", "Acme Oy", 250000]]);
});
test("Czech: Datum zaúčtování, Částka, Měna; a mixed-currency file is flagged", () => {
  const r = readStatement("Datum zaúčtování;Částka;Měna;Název protistrany;Zpráva pro příjemce\n15.01.2026;-45,90;CZK;Albert;nákup\n16.01.2026;10,00;EUR;Acme;faktura\n");
  assert.equal(r.rows.length, 2);
  assert.ok(r.problems.some((p) => /mixes currencies/.test(p)));
});
test("Italian: Valuta is a currency, Data is the date (dd/mm with a day over 12)", () => {
  const r = readStatement("Data;Descrizione;Importo;Valuta\n15/01/2026;Esselunga;-45,90;EUR\n");
  assert.deepEqual(flat(r), [["2026-01-15", "Esselunga", -4590]]);
});
test("Portuguese: Data Mov., Descrição, Montante, Saldo", () => {
  const r = readStatement("Data Mov.;Descrição;Montante;Saldo\n15-01-2026;Continente;-45,90;100,00\n");
  assert.deepEqual(flat(r), [["2026-01-15", "Continente", -4590]]);
});
