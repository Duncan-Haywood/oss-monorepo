// RapidOCR's reading leads tesseract's four, and a total the four outvote it with is taken
// only when the receipt's arithmetic confirms it (receipts.mjs parseReceiptPasses `lead`).
// Chosen on 600 CORD train photos (eval/lead-vote-2026-11-17.md); receipt text here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceiptPasses } from "./receipts.mjs";
import { settleReadings } from "./photoocr.mjs";
import { receiptPassesFromFile } from "./ocr.mjs";

const slip = (total) => `WARUNG SARI\n1 x Nasi Goreng 25,000\n1 x Es Teh 7,500\nTOTAL ${total}\nCASH 100,000`;

test("an unconfirmed majority does not outvote the lead reading's total", () => {
  // tesseract misreads the 3 as a 6 three times out of four; nothing on the slip gives 62,500
  const five = [slip("32,500"), slip("62,500"), slip("62,500"), slip("82,500"), slip("62,500")];
  assert.equal(parseReceiptPasses(five).cents, 6250000);
  const led = parseReceiptPasses(five, { lead: true });
  assert.equal(led.cents, 3250000);
  assert.ok(led.notes.some((n) => /kept 32500\.00 from the first engine's reading over 62500\.00.*check the total/.test(n)));
  // the page says so too, so a kept total is still checked by eye
  const s = settleReadings(five, { lead: true });
  assert.match(s.note, /kept 32500\.00 from the first engine's reading/);
  assert.match(s.text, /TOTAL 32,500/);
  assert.equal(settleReadings(five).note.includes("62500.00"), true);
});

test("a majority the receipt's arithmetic confirms still outvotes the lead", () => {
  const five = [slip("62,500"), slip("32,500"), slip("32,500"), slip("32,500"), slip("38,500")];
  assert.equal(parseReceiptPasses(five, { lead: true }).cents, 3250000);
  assert.equal(parseReceiptPasses(five).cents, 3250000);
});

test("lead needs three readings and a lead total; fewer readings vote as before", () => {
  const two = [slip("32,500"), slip("62,500")];
  assert.equal(parseReceiptPasses(two, { lead: true }).cents, parseReceiptPasses(two).cents);
  // an empty lead reading is not a lead: the others vote as without one
  const blank = ["", slip("62,500"), slip("62,500"), slip("62,500")];
  assert.equal(parseReceiptPasses(blank, { lead: true }).cents, parseReceiptPasses(blank).cents);
});

test("receiptPassesFromFile marks the readings when a lead engine read the photo", () => {
  const run = (cmd, args) => ({ status: 0, stdout: args.includes("4") ? slip("62,500") : slip("32,500") });
  const led = receiptPassesFromFile("slip.jpg", { run, env: {}, lead: () => slip("32,500") });
  assert.equal(led.length, 3);
  assert.equal(led.lead, true);
  assert.equal(Object.keys(led).includes("lead"), false);
  const none = receiptPassesFromFile("slip.jpg", { run, env: {}, lead: () => { throw new Error("no python"); } });
  assert.equal(none.lead, undefined);
});
