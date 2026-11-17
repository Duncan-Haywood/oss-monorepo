// `receipts FILE --rapidocr` (ocr.mjs receiptTextRapid, rapidocr_rows.py): the command it
// runs, its errors, and the row grouping. RapidOCR itself is not needed here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { receiptTextRapid, RAPIDOCR_SCRIPT } from "./ocr.mjs";
import { parseReceipt } from "./receipts.mjs";

test("a photo runs rapidocr_rows.py under python3, or RAPIDOCR_PYTHON, and its text is cleaned and parsed", () => {
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: "VAT 10%  8,728\nRounding  96,OOO\nTotal...  96,000\n" }; };
  const text = receiptTextRapid("slip.jpg", { run, env: {} });
  assert.deepEqual(calls[0], ["python3", RAPIDOCR_SCRIPT, "slip.jpg"]);
  assert.match(text, /96,000/);
  assert.equal(parseReceipt(text).cents, 9600000);
  receiptTextRapid("slip.PNG", { run, env: { RAPIDOCR_PYTHON: "/opt/ro/bin/python" } });
  assert.equal(calls[1][0], "/opt/ro/bin/python");
});

test("a text receipt is read as it is, with no python run", () => {
  let ran = false;
  assert.throws(() => receiptTextRapid("no-such-receipt.txt", { run: () => { ran = true; return { status: 0, stdout: "" }; }, env: {} }), /ENOENT/);
  assert.equal(ran, false);
});

test("a missing interpreter or RapidOCR is a clear error", () => {
  assert.throws(() => receiptTextRapid("a.jpg", { run: () => ({ error: new Error("ENOENT") }), env: {} }), /python3 is needed/);
  assert.throws(() => receiptTextRapid("a.jpg", { run: () => ({ status: 1, stderr: "rapidocr_rows.py needs RapidOCR: pip install rapidocr-onnxruntime\n" }), env: {} }), /pip install rapidocr-onnxruntime/);
});

test("rapidocr_rows.py groups boxes into rows, top to bottom and left to right", { skip: spawnSync("python3", ["--version"]).error ? "no python3" : false }, () => {
  const r = spawnSync("python3", [RAPIDOCR_SCRIPT, "--selftest"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "ok");
});
