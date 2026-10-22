import test from "node:test";
import assert from "node:assert/strict";
import { cleanOcr, receiptTextFromFile } from "./ocr.mjs";
import { parseReceipt } from "./receipts.mjs";

test("cleanOcr fixes digit look-alikes in amounts and dates, leaves words", () => {
  const out = cleanOcr("Total $l2.5O\nDate 2O26-1O-O3\nTOTAL SOUP BOSS\nTax 1.O5");
  assert.match(out, /Total \$12\.50/);
  assert.match(out, /2026-10-03/);
  assert.match(out, /TOTAL SOUP BOSS/);
  assert.match(out, /Tax 1\.05/);
});

test("OCR-damaged receipt parses after cleanup", () => {
  const raw = "Corner Cafe\n2026-10-O3\nLatte 4.5O\nTax O.36\nTotal 4.86";
  const r = parseReceipt(cleanOcr(raw));
  assert.equal(r.cents, 486);
  assert.equal(r.date, "2026-10-03");
});

test("pdf and image go through the named tool; missing tool explains itself", () => {
  const ok = (out) => () => ({ status: 0, stdout: out, stderr: "" });
  assert.equal(receiptTextFromFile("a.pdf", { run: ok("Total 9.00") }), "Total 9.00");
  let seen;
  const spy = (c, a) => { seen = [c, a]; return { status: 0, stdout: "Total l2.00", stderr: "" }; };
  assert.equal(receiptTextFromFile("a.JPG", { run: spy, env: {} }), "Total 12.00");
  assert.deepEqual(seen, ["tesseract", ["a.JPG", "stdout"]]);
  receiptTextFromFile("a.png", { run: spy, env: { RECEIPT_OCR_CMD: "myocr --lang en {file}" } });
  assert.deepEqual(seen, ["myocr", ["--lang", "en", "a.png"]]);
  assert.throws(() => receiptTextFromFile("a.png", { run: () => ({ error: new Error("ENOENT") }), env: {} }), /tesseract-ocr/);
  assert.throws(() => receiptTextFromFile("a.pdf", { run: ok("  \n") }), /no text layer/);
});
