import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts written from the column names Italian, Portuguese, Brazilian, Polish,
// Finnish, Turkish and Czech bank exports are known to use. Rows made up; no
// real export tried. The point of the dates: 05/01 and 09/01 are both under 12,
// so only the header's language says they are 5 and 9 January.
const rows = (r) => r.rows.map((x) => [x.date, x.desc, x.cents]);
const dates = (r) => r.rows.map((x) => x.date);

test("Italian Dare/Avere with ambiguous dates read day first", () => {
  const r = readStatement("Data contabile;Data valuta;Descrizione;Dare;Avere\n05/01/2026;05/01/2026;PAGAMENTO POS CONAD;45,50;\n09/01/2026;09/01/2026;STIPENDIO;;2500,00\n");
  assert.deepEqual(rows(r), [["2026-01-05", "PAGAMENTO POS CONAD", -4550], ["2026-01-09", "STIPENDIO", 250000]]);
  assert.deepEqual(r.problems.filter((p) => /preamble/.test(p)), []);
});
test("Portuguese Data mov. / Débito / Crédito, dd-mm-yyyy", () => {
  const r = readStatement("Data mov.;Data valor;Descrição;Débito;Crédito;Saldo\n05-01-2026;05-01-2026;COMPRA CONTINENTE;45,50;;1000,00\n09-01-2026;09-01-2026;TRF SALARIO;;2500,00;3500,00\n");
  assert.deepEqual(rows(r), [["2026-01-05", "COMPRA CONTINENTE", -4550], ["2026-01-09", "TRF SALARIO", 250000]]);
  assert.deepEqual(r.problems, []);
});
test("Brazilian Data, Valor, Identificador, Descrição with decimal points", () => {
  const r = readStatement("Data,Valor,Identificador,Descrição\n05/01/2026,-45.50,abc1,Compra no débito Mercado\n09/01/2026,2500.00,abc2,Transferência recebida Acme\n");
  assert.deepEqual(rows(r), [["2026-01-05", "Compra no débito Mercado", -4550], ["2026-01-09", "Transferência recebida Acme", 250000]]);
  assert.deepEqual(r.problems, []);
});
test("Polish Kwota with the title column as description", () => {
  const r = readStatement("Data operacji;Data księgowania;Opis operacji;Tytuł;Nadawca/Odbiorca;Kwota;Waluta;Saldo po operacji\n05/01/2026;05/01/2026;Płatność kartą;BIEDRONKA;;-45,50;PLN;1000,00\n09/01/2026;09/01/2026;Przelew;Wynagrodzenie;ACME;5000,00;PLN;6000,00\n");
  assert.deepEqual(rows(r), [["2026-01-05", "BIEDRONKA", -4550], ["2026-01-09", "Wynagrodzenie", 500000]]);
  assert.deepEqual(r.problems, []);
});
test("Finnish Kirjauspäivä / Määrä / Saaja/Maksaja", () => {
  const r = readStatement("Kirjauspäivä;Määrä;Saaja/Maksaja;Otsikko;Viitenumero;Valuutta\n05.01.2026;-45,50;K-Market;Kortti;;EUR\n09.01.2026;2500,00;Acme Oy;Palkka;;EUR\n");
  assert.deepEqual(rows(r), [["2026-01-05", "K-Market", -4550], ["2026-01-09", "Acme Oy", 250000]]);
  assert.deepEqual(r.problems, []);
});
test("Turkish Tarih / Açıklama / Tutar / Bakiye", () => {
  const r = readStatement("Tarih;Açıklama;Tutar;Bakiye\n05/01/2026;MIGROS;-45,50;1000,00\n09/01/2026;MAAS;5000,00;6000,00\n");
  assert.deepEqual(rows(r), [["2026-01-05", "MIGROS", -4550], ["2026-01-09", "MAAS", 500000]]);
  assert.deepEqual(r.problems, []);
});
test("Czech Datum / Popis / Částka", () => {
  const r = readStatement("Datum;Popis;Částka;Měna\n05.01.2026;Albert;-45,50;CZK\n09.01.2026;Mzda;25000,00;CZK\n");
  assert.deepEqual(rows(r), [["2026-01-05", "Albert", -4550], ["2026-01-09", "Mzda", 2500000]]);
});
test("a US file with English headers and the same ambiguous dates stays month first; an explicit dayFirst:false wins", () => {
  const us = "Date,Description,Amount\n05/01/2026,STORE,-45.50\n09/01/2026,PAY,100.00\n";
  assert.deepEqual(dates(readStatement(us)), ["2026-05-01", "2026-09-01"]);
  const it = "Data contabile;Descrizione;Importo\n05/01/2026;X;-1,00\n09/01/2026;Y;2,00\n";
  assert.deepEqual(dates(readStatement(it, { dayFirst: false })), ["2026-05-01", "2026-09-01"]);
});
