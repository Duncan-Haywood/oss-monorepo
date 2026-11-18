import { test } from "node:test";
import assert from "node:assert/strict";
import { readPhotos, settleReadings, guessedTotal, PASSES, OCR_URLS } from "./photoocr.mjs";

const png = (name) => ({ name, type: "image/png" });
const engine = (texts) => { let i = 0; return { closed: false, recognize: async () => texts[i++], close() { this.closed = true; } }; };

test("each photo becomes one block, damaged digits are repaired, blocks are split by ---", async () => {
  const e = engine(["Blue Bottle\n03/14/2026\n\nTotal l0.62  \n", "Hardware Hank\nTotal 43.2O"]);
  const r = await readPhotos([png("a.png"), png("b.png")], { loadEngine: async () => e, passes: ["6"] });
  assert.equal(r.read, 2);
  assert.equal(r.text, "Blue Bottle\n03/14/2026\nTotal 10.62\n---\nHardware Hank\nTotal 43.20");
  assert.ok(e.closed, "the worker is released");
});

test("non-images and empty reads are skipped with a reason; no image means the engine never loads", async () => {
  let loads = 0;
  const load = async () => { loads++; return engine(["", "Cafe\nTotal 5.00"]); };
  const none = await readPhotos([{ name: "r.pdf", type: "application/pdf" }], { loadEngine: load });
  assert.equal(loads, 0);
  assert.equal(none.skipped[0].name, "r.pdf");
  const r = await readPhotos([png("blank.png"), png("ok.png"), { name: "n.txt", type: "text/plain" }], { loadEngine: load, passes: ["6"] });
  assert.equal(r.read, 1);
  assert.deepEqual(r.skipped.map((s) => s.name).sort(), ["blank.png", "n.txt"]);
});

test("a photo the reader cannot open is skipped and the rest are read; reader files come only from jsDelivr", async () => {
  // SROIE has one scan with a corrupt JPEG; tesseract.js rejects it ("Error attempting to read image")
  const e = { closed: false, recognize: async (f) => { if (f.name === "x.png") throw new Error("Error: Error attempting to read image."); return "Cafe\nTotal 5.00"; }, close() { this.closed = true; } };
  const r = await readPhotos([png("x.png"), png("ok.png")], { loadEngine: async () => e });
  assert.equal(r.read, 1);
  assert.equal(r.text, "Cafe\nTotal 5.00");
  assert.deepEqual(r.skipped, [{ name: "x.png", why: "could not be read (Error attempting to read image.)" }]);
  assert.ok(e.closed);
  for (const u of Object.values(OCR_URLS)) assert.match(u, /^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/)?[^/]+@\d/);
});

// Two readings per photo (PASSES), settled into one block for the box. Receipt text made up.
const A = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00";
const B = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 31.00\nCash Received 101.00\nChange : 70.00";

test("each photo is read in both modes, block mode first; a grey copy at 2,000 px is read again only when the engine makes one", async () => {
  assert.deepEqual(PASSES, ["6", "4", { psm: "6", grow: 2000 }, { psm: "4", grow: 2000 }]);
  const modes = [];
  // the engine returns null for a grown pass when the photo is already 2,000 px or more
  const e = { recognize: async (_f, { psm, grow }) => { if (grow) return null; modes.push(psm); return psm === "6" ? A : B; }, close() {} };
  const r = await readPhotos([png("a.png")], { loadEngine: async () => e });
  assert.deepEqual(modes, ["6", "4"]);
  assert.match(r.text, /Total Amount: 31\.00/);
  assert.doesNotMatch(r.text, /34\.00/);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].note, /34\.00 once and 31\.00 once; kept 31\.00/);
});

test("readings that agree leave the first reading as it was, with no note", () => {
  const r = settleReadings([A, A.replace("KEDAI", "KEDAl")]);
  assert.equal(r.text, A);
  assert.equal(r.note, null);
});

test("a second reading the arithmetic does not back changes nothing", () => {
  const r = settleReadings(["KEDAI MAJU\nTotal 12.00", "KEDAI MAJU\nTotal 13.00"]);
  assert.equal(r.text, "KEDAI MAJU\nTotal 12.00");
  assert.equal(r.note, null);
});

test("the first reading's lines are kept around the swapped total line, so its date stays", () => {
  const a = A.replace("Date: 05/01/2019", "Date: 05/01/2019 10:43");
  const b = B.replace("Date: 05/01/2019", "Date: 06/01/2019");
  const r = settleReadings([a, b]);
  assert.match(r.text, /Date: 05\/01\/2019 10:43/);
  assert.match(r.text, /Total Amount: 31\.00/);
});

test("a merchant only the second reading found goes on top of the block", () => {
  const r = settleReadings(["Date: 05/01/2019\nTotal 12.00", "KEDAI MAJU\nDate: 05/01/2019\nTotal 12.00"]);
  assert.equal(r.text.split("\n")[0], "KEDAI MAJU");
});

test("one reading, or an empty second one, is the first reading tidied", () => {
  assert.equal(settleReadings(["Cafe\n\nTotal l0.62  "]).text, "Cafe\nTotal 10.62");
  assert.equal(settleReadings(["Cafe\nTotal 5.00", ""]).text, "Cafe\nTotal 5.00");
  assert.equal(settleReadings([]).text, "");
});

test("a photo with no total line says its total is only a guess", () => {
  // on CORD's phone photos the largest-amount guess was right 11 times in 30
  const r = settleReadings(["Kopi 20,000\nNasi 25,000\n50,000", "Kopi 20,000\nNasi 25,000\n50,000"]);
  assert.match(r.note, /no total line found in the photo; 50000\.00 is only the largest amount on it: check the total/);
  assert.equal(guessedTotal("Cafe\nTotal 3.50"), null);
  assert.match(guessedTotal("Cafe\nthank you"), /no total found/);
  // a settled photo with a total line has no note, as before
  assert.equal(settleReadings(["KEDAI MAJU\nTotal 12.00", "KEDAI MAJU\nTotal 12.00"]).note, null);
});

// Four readings (a small phone photo): the grey copy's readings join the vote.
test("a small photo is read four times, and the grey copy's readings can outvote the first", async () => {
  const seen = [];
  const C = "KEDAI MAJU\nDate: 05/01/2019\nSubtotal 30.00\nTax 1.00\nTOTAL 31.00";
  const e = { recognize: async (_f, { psm, grow }) => { seen.push(`${psm}${grow ? "g" : ""}`); return grow ? C : "KEDAI MAJU\nDate: 05/01/2019\nSubtotal 30.00\nTax 1.00"; }, close() {} };
  const r = await readPhotos([png("a.png")], { loadEngine: async () => e });
  assert.deepEqual(seen, ["6", "4", "6g", "4g"]);
  assert.match(r.text, /Total 31\.00|TOTAL 31\.00/);
  assert.match(r.notes[0].note, /31\.00 in 2 of 4 readings; kept 31\.00/);
});

test("a big photo's shrunk grey copy is read first, so its text is the block and its total leads", async () => {
  // the engine reads the photo twice (4,000 px, misread) and a copy shrunk to 2,000 px twice
  const e = engine(["Kedai\n05/03/2018\nTotal 8.20", "Kedai\nTotal 8.20",
    { text: "KEDAI MAJU\n05/03/2018\nTotal 18.20", shrunk: true }, { text: "KEDAI MAJU\nTotal 18.20", shrunk: true }]);
  const r = await readPhotos([png("scan.jpg")], { loadEngine: async () => e });
  assert.equal(r.readings, 4);
  assert.equal(r.text, "KEDAI MAJU\n05/03/2018\nTotal 18.20");
  assert.deepEqual(r.notes, []);
});

// Unevenly lit photos are read with SHADED_PASSES: block mode, global then local
// threshold, on the photo and the grey copy (README, "Shaded photos: a local threshold").
test("an engine that measures a photo as unevenly lit reads it with the local threshold; an evenly lit one as before", async () => {
  const { SHADED_PASSES, SHADED_CUT } = await import("./photoocr.mjs");
  assert.deepEqual(SHADED_PASSES, ["6", { psm: "6", threshold: "2" }, { psm: "6", grow: 2000 }, { psm: "6", grow: 2000, threshold: "2" }]);
  const seen = [];
  const e = {
    shading: async (f) => (f.name === "shadow.jpg" ? SHADED_CUT + 0.1 : 0.04),
    recognize: async (f, { psm, grow, threshold }) => { seen.push(`${f.name}:${psm}${grow ? "g" : ""}${threshold ? `t${threshold}` : ""}`); return "KEDAI MAJU\nTotal 31.00"; },
    close() {},
  };
  const r = await readPhotos([{ name: "shadow.jpg", type: "image/jpeg" }, { name: "scan.jpg", type: "image/jpeg" }], { loadEngine: async () => e });
  assert.deepEqual(seen, ["shadow.jpg:6", "shadow.jpg:6t2", "shadow.jpg:6g", "shadow.jpg:6gt2", "scan.jpg:6", "scan.jpg:4", "scan.jpg:6g", "scan.jpg:4g"]);
  assert.equal(r.shaded, 1);
  // a measurement that fails reads the photo as before
  seen.length = 0;
  await readPhotos([{ name: "x.jpg", type: "image/jpeg" }], { loadEngine: async () => ({ ...e, shading: async () => { throw new Error("no canvas"); } }) });
  assert.deepEqual(seen, ["x.jpg:6", "x.jpg:4", "x.jpg:6g", "x.jpg:4g"]);
});

// The engine wrapper sets the threshold on every reading, so a Sauvola reading
// never leaks into the next reading (a stub worker).
test("loadEngine sets the threshold method on every reading, back to Otsu when a pass names none", async () => {
  const { loadEngine } = await import("./photoocr.mjs");
  const set = [];
  const had = globalThis.Tesseract;
  globalThis.Tesseract = { createWorker: async () => ({ setParameters: async (p) => set.push(p), recognize: async () => ({ data: { text: "TOTAL 1.00" } }), terminate: async () => {} }) };
  try {
    const e = await loadEngine();
    for (const pass of ["6", { psm: "6", threshold: "2" }, "4"]) await e.recognize("photo", typeof pass === "string" ? { psm: pass } : pass);
    assert.deepEqual(set, [{ tessedit_pageseg_mode: "6", thresholding_method: "0" }, { tessedit_pageseg_mode: "6", thresholding_method: "2" }, { tessedit_pageseg_mode: "4", thresholding_method: "0" }]);
  } finally { globalThis.Tesseract = had; }
});

// 2026-11-17 red team: the lines around a swapped tax or total line are all kept
test("the tax and total swaps keep the first reading's other lines, above and below", async () => {
  const { settleReadings: settle } = await import("./photoocr.mjs");
  // a tax line read wrong is replaced in place; the merchant above and the footer below stay
  const tax = settle(["Diner\nBurger 13.50\nTAX: 0.68\nTotal 14.36\nThank you", "Diner\nBurger 13.50\nTAX: 0.86\nTotal 14.36", "Burger 13.50\nTAX: 0.86\nTotal 14.36"]);
  assert.equal(tax.text, "Diner\nBurger 13.50\nTax 0.86\nTotal 14.36\nThank you");
  // a total line read wrong is replaced in place, and the line after it stays
  const total = settle(["Diner\nSubtotal 13.50\nTotal 14.63\nThank you", "Diner\nSubtotal 13.50\nTax 0.86\nTotal 14.36", "Subtotal 13.50\nTax 0.86\nTotal 14.36"]);
  assert.equal(total.text, "Diner\nSubtotal 13.50\nTax 0.86\nTotal 14.36\nThank you");
});

test("lightSpread: no pixels, or one even grey, is 0", async () => {
  const { lightSpread } = await import("./photoocr.mjs");
  assert.equal(lightSpread(new Uint8Array(0)), 0);
  assert.equal(lightSpread(new Uint8Array(16).fill(200)), 0);
  assert.ok(Math.abs(lightSpread(Uint8Array.from([50, 150])) - 0.5) < 1e-9);
});

// a browser stand-in: createImageBitmap gives a photo of the given size, a canvas records
// what was drawn on it, and tesseract echoes back what it was handed
function fakeBrowser({ width, height }) {
  const drawn = [];
  const canvas = () => {
    const c = { width: 0, height: 0 };
    c.getContext = () => ({
      drawImage: (...a) => drawn.push({ canvas: c, args: a.slice(1) }),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
    });
    return c;
  };
  const saved = { document: globalThis.document, createImageBitmap: globalThis.createImageBitmap, Tesseract: globalThis.Tesseract };
  globalThis.document = { createElement: () => canvas() };
  globalThis.createImageBitmap = async () => ({ width, height, close() {} });
  globalThis.Tesseract = { createWorker: async () => ({ setParameters: async () => {}, recognize: async (img) => ({ data: { text: img === "photo" ? "photo" : `copy ${img.width}x${img.height}` } }), terminate: async () => {} }) };
  return { drawn, restore: () => Object.assign(globalThis, saved) };
}

test("loadEngine: the grey copy's long side is the size asked for, and a shrunk copy says so", async () => {
  const { loadEngine } = await import("./photoocr.mjs");
  let b = fakeBrowser({ width: 1000, height: 750 });
  try {
    const e = await loadEngine();
    assert.equal(await e.recognize("photo", { psm: "6", grow: 2000 }), "copy 2000x1500");
    assert.deepEqual(b.drawn.at(-1).args, [0, 0, 2000, 1500]);
  } finally { b.restore(); }
  b = fakeBrowser({ width: 3000, height: 4000 });
  try {
    const e = await loadEngine();
    assert.deepEqual(await e.recognize("photo", { psm: "6", grow: 2000 }), { text: "copy 1500x2000", shrunk: true });
    // a photo already 2,000 on its long side is not read again
    const same = fakeBrowser({ width: 2000, height: 1000 });
    try { assert.equal(await (await loadEngine()).recognize("photo", { grow: 2000 }), null); } finally { same.restore(); }
  } finally { b.restore(); }
});

test("loadEngine: shading draws the whole photo onto the 32 x 32 thumbnail", async () => {
  const { loadEngine, SHADE_SIDE } = await import("./photoocr.mjs");
  const b = fakeBrowser({ width: 1200, height: 1600 });
  try {
    const e = await loadEngine();
    assert.equal(await e.shading("photo"), 0);
    assert.deepEqual(b.drawn.at(-1).args, [0, 0, SHADE_SIDE, SHADE_SIDE]);
    assert.equal(b.drawn.at(-1).canvas.width, SHADE_SIDE);
  } finally { b.restore(); }
});
