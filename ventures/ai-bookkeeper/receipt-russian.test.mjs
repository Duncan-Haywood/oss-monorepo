// Russian fiscal receipts (cdek-ocr/receipt-ocr-ru photos read by RapidOCR,
// eval/receipt-ocr-ru-2026-11-18.md). Receipt text here is made up in the photos' style:
// the engine has no Cyrillic model, so ИТОГ comes out as HTOr, MTOr, UTOr and so on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";
import { cleanOcr } from "./cleanocr.mjs";

const read = (t) => parseReceipt(cleanOcr(t));

test("ИТОГ in Cyrillic and in the engine's Latin look-alikes is the total line", () => {
  assert.equal(read("ООО ЛЕНТА\nХЛЕБ 64.99\nМОЛОКО 109.99\nСКИДКА 48.93\nИТОГ =650.07\nБЕЗНАЛИЧНЫМИ =650.07").cents, 65007);
  for (const w of ["HTOr", "MTOr", "NTOr", "UTOr", "WTOr", "ИTOr", "MTOF"]) {
    assert.equal(read(`TOBAP 899.00*1\nCKHAKA 249.00\n${w}  =650.00\nCYMMA HAC 20%  =108.33\nCaxapa 1000.00`).cents, 65000, w);
  }
  assert.equal(read("MonOKo 109.99 *1 =109.99\nCKHAKA 56.66\nMTOrO K OnMATE C y4ETOM CKHAKH  =231.94\nBE3HANHHbIMH 231.94").cents, 23194);
  // a word that only looks like it inside an English line is not taken
  assert.equal(read("AUTO PARTS\nMOTOR OIL 12.00\nTOTAL 15.00").cents, 1500);
});

test("ИТОГ без скидки (before the discount) is not the total", () => {
  assert.equal(read("TOBAP 199.00*1 =199.00\nHTOrO 6e3 CKHAKH  199.00\nCKHAKA 18.00\nHTOr  181.00").cents, 18100);
});

test("a kopeck digit the engine dropped on the ИТОГ line is a zero", () => {
  assert.equal(read("TOBAP  =27.00\nVTOr  27.0\nCnacn6o").cents, 2700);
  assert.equal(read("T8M60B 1.000X311.00=311.\nHTOrO.  2644.\nCYMMA HAC 10% 240.36").cents, 264400);
});

test("an ИТОГ amount printed once gives way to the amount printed below it more than once", () => {
  // the last item's price on the ИТОГ row, the total itself on the card line and a bare line
  assert.equal(read("TOBAP  215.00*1\n1 MOPKOBb =215.00\nTOBAP  50.00*1\nUTOr  =50.00\nKaccup  GE3HANM4H61MM  =413.00\n=413.00").cents, 41300);
  // a digit misread on the ИТОГ line, the right amount three times below
  assert.equal(read("HAC 5%  KANYCTA  109.00*1\nHTOr  119.00\nCVMMA HAC 5%  109.00\nAN AEMHEKA  =109.00\nNPHHATO 109.00").cents, 10900);
  // the total drifted up a row: it counts for the others, not for the ИТОГ line's own amount
  assert.equal(read("TOBAP  -819.00\nHTOr  =39.00\n=819.00").cents, 81900);
  // a bare copy right above the ИТОГ line backs the ИТОГ amount, so the card line's misread
  // amount does not replace it
  assert.equal(read("ЧАЙ 164.00\n=333.00\nИTOrO K OnnATE  =333.00\n6E3HAJNYHbIMM  =55.50").cents, 33300);
  // printed twice already: nothing changes
  assert.equal(read("TOBAP 70.00*1 =70.00\nHTOr =535.00\nBE3HANHHbIMH =535.00\n=70.00\n=70.00").cents, 53500);
});

test("printed once each: the card line, or cash less change, settles a misread ИТОГ", () => {
  assert.equal(read("1 COTe 109.00*1 =109.00\n1 6yn04Ka 79.00*1 =79.00\nWTOr  =712.00\nCVMMA HAC 5%  =34.14\n6E3HAnM4H6IMM  =717.00").cents, 71700);
  assert.equal(read("TOBAP 39.00*1 =39.00\nHTOr  =127.00\nCYMMA HAC5%  =8.43\nHANNHBI1M  =177.00\n=200.00\nCAAHA  =23.00").cents, 17700);
  // cash with change and nothing that subtracts: the ИТОГ line stands
  assert.equal(read("TOBAP 39.00*1 =39.00\nHTOr  =127.00\nHAJMHHIMM  =500.00\nCAAHA  =300.00").cents, 12700);
});

test("the ИТОГ row's merged neighbours: an item's price times quantity, a tax amount beside it", () => {
  assert.equal(read("TOBAP 70.00*1 =70.00\nUTOr  =439.00  =20.91\nCYMMA HAC 5%\n6E3HA0M4H6IMM").cents, 43900);
  assert.equal(read("ЧЕК 0051\nHTOr  119.00*1\n=349.00\nKaccup  6E3HA0M4HBIMA  =349.00").cents, 34900);
});

test("an ИТОГ that two payments below it add up to stands (card and an advance)", () => {
  assert.equal(read("169.00X 1 WT  =169.00 PV6\nNTOr:  =6084.00 Py6\nCYMMA HAC 20%  =1014.00 Py6\n5E3HAnM4HbMM:  =181.00 Py6\nABAHC:  =5903.00 Py6").cents, 608400);
});

// eval/receipt-ocr-ru-train2-2026-11-18.md: slips with no ИТОГ amount
test("no ИТОГ amount: the card terminal's СУММА (РУБ) is the total", () => {
  // the ИТОГ line lost; the item line 399.96 is larger than what was charged
  assert.equal(read("TOBAP 89.99*1 =89.99\nKOBEP 399.96\nNO,/44EHO   KAPTA  =355.96\nCyMMa (Py6):  355.96\nCUMMA HAC 20%  =59.34").cents, 35596);
  // "MTOr" alone, its amount on the line below with the VAT words
  assert.equal(read("TOBAP 2000.00\nMTOr\nCYMMA HAC20%  =39617.00\n=6602.83\nMIR  <E>*4913\nCyHMa<Py6>  39617.00\n453116.2").cents, 3961700);
  // "HTOD 89.9%": the ИТОГ amount unreadable, the terminal slip says 89.99
  // the terminal's thousands mark: 1'325.00, not 325.00
  assert.equal(read("1 YCAYFH AOCTaBKH  1225.00*1  WT. =1225.00\nCYMMA(PY6.):  1'325.00\nKOMMCCM9 6AHKA - 0 Py6.\nCYMMA HAC 7%  =86. 61").cents, 132500);
  assert.equal(read("NTOr 6E3 CKMAOK  99.99\nCKHAKA  10.00\nHTOD  89.9%\nYisa Credit  <E1>*2677\nCyMMa<Py6>  89.99 KOMHCCHA: 0 Py6.").cents, 8999);
});

test("no ИТОГ amount: the card line's amount when printed twice or more", () => {
  // "MTOr" alone over the card line; the before-discount 1969.00 is larger
  assert.equal(read("leHa C HAC 10%:  1* 1969.00 =1969.00\nHTOr0 6e3 CKHAKH  1969.00\nMTOr\n6E3HANN4HBIM  1828.00\nCyMMa HAC 10%  1828.00").cents, 182800);
  // a café slip whose rows run one off: the card line carries the VAT amount, printed once,
  // so it is not taken and the largest amount stands
  assert.equal(read("HAC 5%  1 MakapOHbl  =199.00\nTOBAP  119.00*1  =119.00\nCYMMA HAC 5%  -562.00\n6E3HAIM4H6M  =26.77\nKaccup  =562.00").cents, 56200);
  // change was given: the cash line is the money handed over, so it is not taken
  const r = read("TOBAP 300.00\nMTOr\nHAnNYHbIMM  =500.00\n=500.00\nCAA4A  =200.00\nCYMMA HAC 20%  =50.00");
  assert.ok(!r.notes.some((n) => /card or cash line/.test(n)), r.notes.join("; "));
  assert.ok(read("TOBAP 300.00\nMTOr\nHAnNYHbIMM  =300.00\n=300.00\nCYMMA HAC 20%  =50.00").notes.some((n) => /card or cash line/.test(n)));
});

test("ИТОГ amount with its point read as a dash between spaces", () => {
  assert.equal(read("CKMaKa.  0.70\nHTor  1247  -00\nOKPYTIEHHE  0.70\nHANHBIII  1247.00\nnONYYEHO  1500.00").cents, 124700);
});
