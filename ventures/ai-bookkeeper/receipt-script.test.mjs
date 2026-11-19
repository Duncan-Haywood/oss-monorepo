// receiptScript (receipts.mjs) picks the RapidOCR recogniser from a Latin reading, and readPhotos'
// "auto" alphabet reads a Cyrillic-looking photo again with the Cyrillic recogniser
// (eval/receipt-script-2026-11-19.md). The slips below are written in the style of the
// cdek-ocr/receipt-ocr-ru photos as RapidOCR's Latin model prints them, not copied from them.
import test from "node:test";
import assert from "node:assert/strict";
import { receiptScript } from "./receipts.mjs";
import { readPhotos } from "./photoocr.mjs";

const RU_LATIN = 'OOO "CoBPeMeHHaA AnTEKA"\nKACCOBbIA HEK  nPHXOA\nMOJOKO 3.2%  89.99 * 1 =89.99\nHTOr  =89.99\nCyMMA HAC 10%  =8.18\nbE3HAnMHHbIMM  =89.99';
const RU_CYR = 'ООО "СОВРЕМЕННАЯ АПТЕКА"\nКАССОВЫЙ ЧЕК ПРИХОД\nМОЛОКО 3.2% 89.99 * 1 =89.99\nИТОГ =89.99';
const US = "McDONALD'S #1234\nMcCHICKEN  2.49\nMcFLURRY OREO  3.79\nBigMac  5.99\nSubTOTAL 12.27\nTax 1.10\nTOTAL 13.37\nPaid with iPHONE Wallet\nShowusyourreviewonTripAdvisor";

test("receiptScript: look-alike Russian, real Cyrillic and a Latin receipt with glued words and brand prefixes", () => {
  assert.equal(receiptScript(RU_LATIN), "cyrillic");
  assert.equal(receiptScript(RU_CYR), "cyrillic");
  assert.equal(receiptScript(US), "latin");
  assert.equal(receiptScript(""), "latin");
  assert.equal(receiptScript(null), "latin");
  // two such words are not enough (SRD's most was two)
  assert.equal(receiptScript("eBBQ GRILL\npTOTAL 9.00\nTOTAL 9.00"), "latin");
  // quantities glued to item names are not words (WildReceipt's two misses had these)
  assert.equal(receiptScript("1xBTL WINE 24.00\n2xPT LAGER 9.00\n10xTVA 3.30\n3xESPRESSO 6.00\nTOTAL 42.30"), "latin");
});

const photo = (name) => ({ name, type: "image/jpeg" });
const tesseract = (texts) => async () => ({ recognize: async () => texts.shift() ?? null, close: async () => {} });
const rapidBy = (byScript, opened) => async ({ script }) => {
  opened.push(script);
  if (byScript[script] instanceof Error) throw byScript[script];
  return { read: async () => byScript[script], close: async () => { opened.push(`close ${script}`); } };
};

test("readPhotos auto: a Cyrillic-looking Latin reading is read again in Cyrillic, and that reading leads", async () => {
  const opened = [];
  const r = await readPhotos([photo("ru.jpg")], { rapidScript: "auto", passes: ["6"], loadEngine: tesseract(["HTOr 89.99"]), loadRapid: rapidBy({ latin: RU_LATIN, cyrillic: RU_CYR }, opened) });
  assert.deepEqual(opened.filter((x) => !x.startsWith("close")), ["latin", "cyrillic"]);
  assert.ok(opened.includes("close cyrillic"), "the Cyrillic reader is closed at the end");
  assert.equal(r.cyrillic, 1);
  assert.equal(r.cyrillicError, null);
  assert.match(r.text, /ИТОГ/);
});

test("readPhotos auto: a Latin receipt never downloads the Cyrillic reader", async () => {
  const opened = [];
  const r = await readPhotos([photo("us.jpg"), photo("us2.jpg")], { rapidScript: "auto", passes: ["6"], loadEngine: tesseract(["TOTAL 13.37", "TOTAL 13.37"]), loadRapid: rapidBy({ latin: US, cyrillic: RU_CYR }, opened) });
  assert.deepEqual(opened.filter((x) => !x.startsWith("close")), ["latin"]);
  assert.equal(r.cyrillic, 0);
  assert.equal(r.rapid, 2);
});

test("readPhotos auto: when the Cyrillic reader cannot load, the Latin reading is kept and the page is told why", async () => {
  const opened = [];
  const r = await readPhotos([photo("ru.jpg")], { rapidScript: "auto", passes: ["6"], loadEngine: tesseract(["HTOr 89.99"]), loadRapid: rapidBy({ latin: RU_LATIN, cyrillic: new Error("could not download the RapidOCR reader (403)") }, opened) });
  assert.equal(r.cyrillic, 0);
  assert.match(r.cyrillicError, /403/);
  assert.equal(r.rapid, 1);
  assert.match(r.text, /CyMMA/);
});

test("readPhotos: a fixed alphabet opens only that reader, as before", async () => {
  const opened = [];
  await readPhotos([photo("ru.jpg")], { rapidScript: "latin", passes: ["6"], loadEngine: tesseract(["x"]), loadRapid: rapidBy({ latin: RU_LATIN, cyrillic: RU_CYR }, opened) });
  assert.deepEqual(opened.filter((x) => !x.startsWith("close")), ["latin"]);
});

test("CLI receipts --rapidocr: a Cyrillic-looking reading says which recogniser to set; a Latin one says nothing", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, chmodSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "script-"));
  const photo = join(dir, "slip.jpg");
  writeFileSync(photo, "not really a photo");
  // a stand-in for the RapidOCR interpreter: prints the text in the file named by READING
  const fake = join(dir, "fake-python");
  writeFileSync(fake, '#!/bin/sh\ncat "$READING"\n');
  chmodSync(fake, 0o755);
  const run = (text, extra = {}) => {
    const reading = join(dir, "reading.txt");
    writeFileSync(reading, text);
    const env = { ...process.env, RAPIDOCR_PYTHON: fake, READING: reading, ...extra };
    delete env.RAPIDOCR_REC_MODEL;
    Object.assign(env, extra);
    return spawnSync("node", [cli, "--books", join(dir, "books.json"), "receipts", photo, "--rapidocr"], { encoding: "utf8", env });
  };
  const ru = run(RU_LATIN);
  assert.match(ru.stderr, /looks Cyrillic.*RAPIDOCR_REC_MODEL/s);
  assert.doesNotMatch(run(US).stderr, /looks Cyrillic/);
  assert.doesNotMatch(run(RU_LATIN, { RAPIDOCR_REC_MODEL: "/x/rec.onnx" }).stderr, /looks Cyrillic/);
});
