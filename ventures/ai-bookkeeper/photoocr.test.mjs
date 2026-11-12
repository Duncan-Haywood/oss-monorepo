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

test("each photo is read in both modes, block mode first", async () => {
  assert.deepEqual(PASSES, ["6", "4"]);
  const modes = [];
  const e = { recognize: async (_f, { psm }) => { modes.push(psm); return psm === "6" ? A : B; }, close() {} };
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
