// A second, enlarged look for a Russian slip's seller (rapidocr_rows.py --bands, ocr.mjs
// receiptTextRapid, receipts.mjs withBandSeller): when the first reading names no seller, the
// photo is read again as three bands enlarged twice and a seller found there leads the text.
// The slips are made up in the photos' style; the names are invented shops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptTextRapid, RAPIDOCR_SCRIPT } from "./ocr.mjs";
import { parseReceipt, needsSellerLook, withBandSeller } from "./receipts.mjs";

const BODY = "КАССОВЫЙ ЧЕК/ПРИХОД\nСМЕНА 0020\nИНН 7800000000\nХлеб ржаной  64.99*1  =64.99\nМолоко  109.99*1  =109.99\nИТОГ  =174.98\nБЕЗНАЛИЧНЫМИ  =174.98\n";
const BANDS = 'КАССОВЫЙ ЧЕК\nООО "Ромашка"\nИНН 7800000000\nИТОГ  =174.98\n';

test("only a Russian reading with no seller asks for a second look", () => {
  assert.equal(needsSellerLook(BODY), true);
  assert.equal(needsSellerLook(`ООО "Ромашка"\n${BODY}`), false);
  assert.equal(needsSellerLook("WALMART\nTOTAL  12.00\n"), false);
  assert.equal(needsSellerLook(""), false);
});

test("a seller from the bands leads the text; totals and items stay the first reading's", () => {
  const t = withBandSeller(BODY, BANDS);
  assert.equal(parseReceipt(t).merchant, 'ООО "Ромашка"');
  assert.equal(parseReceipt(t).cents, parseReceipt(BODY).cents);
  assert.equal(t.endsWith(BODY), true);
  // nothing found in the bands, or a first reading that already has a seller: unchanged
  assert.equal(withBandSeller(BODY, "КАССОВЫЙ ЧЕК\n"), BODY);
  const has = `ИП Петров А.А.\n${BODY}`;
  assert.equal(withBandSeller(has, BANDS), has);
});

test("receiptTextRapid runs --bands only when the first reading has no seller, and a failed second look keeps the first", () => {
  const calls = [];
  const run = (cmd, args) => { calls.push(args); return { status: 0, stdout: args.includes("--bands") ? BANDS : BODY }; };
  assert.equal(parseReceipt(receiptTextRapid("slip.jpg", { run, env: {} })).merchant, 'ООО "Ромашка"');
  assert.deepEqual(calls, [[RAPIDOCR_SCRIPT, "slip.jpg"], [RAPIDOCR_SCRIPT, "--bands", "slip.jpg"]]);
  calls.length = 0;
  receiptTextRapid("slip.jpg", { run: (c, a) => { calls.push(a); return { status: 0, stdout: "WALMART\nTOTAL  12.00\n" }; }, env: {} });
  assert.equal(calls.length, 1);
  const failed = (c, a) => (a.includes("--bands") ? { status: 1, stderr: "boom" } : { status: 0, stdout: BODY });
  assert.equal(parseReceipt(receiptTextRapid("slip.jpg", { run: failed, env: {} })).cents, 17498);
});
