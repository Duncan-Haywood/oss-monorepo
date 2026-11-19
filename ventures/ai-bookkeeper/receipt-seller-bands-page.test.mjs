// The page's second look for a Russian slip's seller (photoocr.mjs withSecondLook, readBands,
// bandSize): the same rule as the CLI's (receipt-seller-bands.test.mjs), with the bands drawn
// on a canvas and read by the page's RapidOCR port. The slips are made up in the photos'
// style; the names are invented shops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPhotos, readBands, bandSize, withSecondLook, BANDS } from "./photoocr.mjs";
import { parseReceipt } from "./receipts.mjs";

const BODY = "КАССОВЫЙ ЧЕК/ПРИХОД\nСМЕНА 0020\nИНН 7800000000\nХлеб ржаной  64.99*1  =64.99\nМолоко  109.99*1  =109.99\nИТОГ  =174.98\nБЕЗНАЛИЧНЫМИ  =174.98\n";
const SELLER_BAND = 'ООО "Ромашка"\nИНН 7800000000\n';
const photo = (name) => ({ name, type: "image/jpeg" });
const tesseract = (texts) => async () => ({ recognize: async () => texts.shift() ?? null, close: async () => {} });

test("bandSize: three overlapping bands, each enlarged twice, capped at 2,000 px like RapidOCR's own fit", () => {
  assert.deepEqual(BANDS, [[0, 0.4], [0.3, 0.7], [0.6, 1]]);
  // a small photo's band is enlarged twice
  assert.deepEqual(bandSize(400, 1000, 0, 0.4), { y0: 0, h: 400, w2: 800, h2: 800 });
  // a phone photo's band reaches 2,000 on its long side, the size RapidOCR would fit the doubled band to
  assert.deepEqual(bandSize(1200, 1600, 0.3, 0.7), { y0: 480, h: 640, w2: 2000, h2: 1067 });
  // a band already over 2,000 px is shrunk, as RapidOCR would
  const big = bandSize(3000, 4000, 0.6, 1);
  assert.equal(Math.max(big.w2, big.h2), 2000);
});

test("readBands reads every band top to bottom and joins the rows", async () => {
  const seen = [];
  const draw = async (f, top, bottom) => ({ rgba: new Uint8Array(4), width: 1, height: 1, top, bottom });
  const t = await readBands({}, async (px) => { seen.push([px.top, px.bottom]); return `band ${seen.length}\n`; }, draw);
  assert.deepEqual(seen, BANDS);
  assert.equal(t, "band 1\nband 2\nband 3\n");
});

test("withSecondLook: only a Russian reading with no seller is read again; a failed look keeps the first reading", async () => {
  let calls = 0;
  const reader = { readBands: async () => { calls++; return SELLER_BAND; } };
  const r = await withSecondLook(reader, {}, BODY);
  assert.deepEqual([r.looked, r.found, calls], [true, true, 1]);
  assert.equal(parseReceipt(r.text).merchant, 'ООО "Ромашка"');
  assert.equal(parseReceipt(r.text).cents, 17498);
  // a slip with its seller, a Latin slip, a reader with no bands: no second read
  for (const t of [`ИП Петров А.А.\n${BODY}`, "WALMART\nTOTAL  12.00\n"]) assert.equal((await withSecondLook(reader, {}, t)).text, t);
  assert.equal(calls, 1);
  assert.equal((await withSecondLook({}, {}, BODY)).looked, false);
  const failed = await withSecondLook({ readBands: async () => { throw new Error("worker stopped"); } }, {}, BODY);
  assert.deepEqual([failed.text, failed.looked, failed.found], [BODY, true, false]);
});

test("readPhotos: a Cyrillic slip with no seller gets the bands from the Cyrillic reader, and the seller leads", async () => {
  const opened = [];
  const r = await readPhotos([photo("slip.jpg")], {
    passes: ["6"], rapidScript: "auto",
    loadEngine: tesseract(["NTOF =174.98"]),
    loadRapid: async ({ script }) => {
      opened.push(script);
      return script === "latin"
        ? { read: async () => "KACCOBbIA 4EK nPHXOA\nCyMMA  =174.98\nNTOF  =174.98\n", readBands: async () => { throw new Error("the Latin reader is not asked"); }, close: async () => {} }
        : { read: async () => BODY, readBands: async () => SELLER_BAND, close: async () => {} };
    },
  });
  assert.deepEqual(opened, ["latin", "cyrillic"]);
  assert.deepEqual([r.cyrillic, r.bandLooks, r.bandSellers], [1, 1, 1]);
  assert.equal(parseReceipt(r.text.split("\n---\n")[0]).merchant, 'ООО "Ромашка"');
});

test("readPhotos: a slip that already names its seller, or a Latin slip, is read once", async () => {
  let bandReads = 0;
  const rapid = (text) => async () => ({ read: async () => text, readBands: async () => { bandReads++; return SELLER_BAND; }, close: async () => {} });
  const a = await readPhotos([photo("a.jpg")], { passes: ["6"], rapidScript: "cyrillic", loadEngine: tesseract(["x"]), loadRapid: rapid(`ИП Петров А.А.\n${BODY}`) });
  const b = await readPhotos([photo("b.jpg")], { passes: ["6"], loadEngine: tesseract(["x"]), loadRapid: rapid("Cafe\nTotal  9.99\n") });
  assert.equal(bandReads, 0);
  assert.deepEqual([a.bandLooks, b.bandLooks], [0, 0]);
});
