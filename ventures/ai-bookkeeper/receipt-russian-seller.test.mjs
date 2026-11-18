// The seller on Russian fiscal slips read by a Cyrillic recogniser (RapidOCR with PaddleOCR's
// East Slavic model, RAPIDOCR_REC_MODEL; eval/receipt-ocr-ru-eslav-2026-11-18.md). The text
// is made up in the photos' style; the names are invented shops, not the dataset's sellers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, russianSeller } from "./receipts.mjs";
import { cleanOcr } from "./cleanocr.mjs";
import { fold, bestIn, similar } from "./eval/receipt-ru-names.mjs";

const read = (t) => parseReceipt(cleanOcr(t));
const SLIP = (head) => `КАССОВЫЙ ЧЕК/ПРИХОД\nСМЕНА 0020\n${head}\nИНН 7800000000\nХлеб ржаной  64.99*1  =64.99\nМолоко  109.99*1  =109.99\nИТОГ  =174.98\nБЕЗНАЛИЧНЫМИ  =174.98\nСАЙТ ФНС www.nalog.gov.ru`;

test("the line that starts with a legal form is the merchant, not the slip's header", () => {
  assert.equal(read(SLIP('ООО "Ромашка"')).merchant, 'ООО "Ромашка"');
  assert.equal(read(SLIP("ИП Петров А.А.")).merchant, "ИП Петров А.А.");
  assert.equal(read(SLIP('АКЦИОНЕРНОЕ ОБЩЕСТВО "ТОРГОВЫЙ ДОМ "ЛУЧ""')).merchant, 'АКЦИОНЕРНОЕ ОБЩЕСТВО "ТОРГОВЫЙ ДОМ "ЛУЧ""');
  assert.equal(read(SLIP('ООО "Ромашка"')).cents, 17498);
});

test("0 for О and Latin look-alikes in the form are read, and the form is printed in Cyrillic", () => {
  assert.equal(read(SLIP('000 "Ромашка"')).merchant, 'ООО "Ромашка"');
  assert.equal(read(SLIP('O0O "Ромашка"')).merchant, 'ООО "Ромашка"');
  assert.equal(read(SLIP('AO "ЛУЧ-СЕВЕР"')).merchant, 'АО "ЛУЧ-СЕВЕР"');
  assert.equal(read(SLIP("ип Петров А.А.")).merchant, "ИП Петров А.А.");
  // the engine's ОБШЕСТВО for ОБЩЕСТВО, and a column gap after the spelled-out form
  assert.equal(read(SLIP('АКЦИОНЕРНОЕ ОБШЕСТВО  ТОРГОВЫЙ ДОМ "ЛУЧ"')).merchant, 'АКЦИОНЕРНОЕ ОБЩЕСТВО ТОРГОВЫЙ ДОМ "ЛУЧ"');
});

test("a quoted name ends at its closing quote; a later column is not part of it", () => {
  assert.equal(read(SLIP('000 "КЛЁН БАР" 190000, г. Санкт-Петербург, ул. Садовая')).merchant, '000 "КЛЁН БАР"'.replace("000", "ООО"));
  assert.equal(read(SLIP('Место расчетов, д. 1  ООО "Ромашка"  Кассир')).merchant, 'ООО "Ромашка"');
});

test("the card's bank and the fiscal data operator are not the seller", () => {
  const t = `ПАО СБЕРБАНК\nОПЛАТА  174.98\nООО "Ярус" ("ОФД-Я")\n${SLIP('ООО "Ромашка"')}`;
  assert.equal(read(t).merchant, 'ООО "Ромашка"');
  assert.equal(russianSeller(['ООО "ПЕТЕР-СЕРВИС СПЕЦТЕХНОЛОГИИ"', "ИТОГ =10.00"]), null);
});

test("a form with no name after it, or an English receipt, gives no Russian seller", () => {
  assert.equal(russianSeller(["ИП", "ИП 780000000000", "ИТОГ =10.00"]), null);
  // the English merchant rules are unchanged: no Cyrillic, no ИТОГ line
  assert.equal(read("AO SHOP LTD\n12 Main St\nMILK 1.99\nTOTAL 1.99").merchant, "AO SHOP LTD");
  assert.equal(read("TRADER JOE'S\nMILK 1.99\nTOTAL 1.99").merchant, "TRADER JOE'S");
});

test("ИТОГ read with a Cyrillic Н or М for the И is the total line", () => {
  for (const w of ["НТОГ", "МТОГО", "ИТОГ", "ИT0Г"]) assert.equal(read(`ООО "Ромашка"\nМолоко  109.99*1  =109.99\nХлеб  64.99*1  =64.99\n${w}  =174.98\nСУММА НДС 10%  =15.91`).cents, 17498, w);
});

test("the names scorer folds look-alikes and finds a name inside a longer line", () => {
  assert.equal(fold('000 "Лента"'), fold('ООО "ЛЕНТА"'));
  assert.equal(fold("Ёлка"), "ЕЛКА");
  assert.equal(bestIn('ООО "Лента"', 'ТК 702  000 "ЛЕНТА"  Кассир'), 1);
  assert.ok(bestIn("Молоко Эконива", "Молоко ЭКонива у/пасте  109.99") >= 0.8);
  assert.ok(bestIn("Молоко Эконива", "MonOKo 3KOHMBA y/naCTe  109.99") < 0.8);
  assert.equal(similar("ИП Петров", null), 0);
});
