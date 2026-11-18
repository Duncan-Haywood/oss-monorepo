// OCR commands run with OMP_THREAD_LIMIT=1 and a time limit (ocr.mjs ocrRunOptions;
// eval/ocr-time-limit-2026-11-18.md). Real child processes: a tiny shell script stands in
// for the OCR engine, so nothing here needs tesseract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { receiptTextFromFile, receiptPassesFromFile, readStatementFile, ocrRunOptions, OCR_TIMEOUT_S } from "./ocr.mjs";

function tool(body) {
  const dir = mkdtempSync(join(tmpdir(), "ocr-limit-"));
  const sh = join(dir, "fakeocr");
  writeFileSync(sh, `#!/bin/sh\n${body}\n`);
  chmodSync(sh, 0o755);
  const photo = join(dir, "slip.png");
  writeFileSync(photo, "not really a png");
  return { sh, photo, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the OCR command sees OMP_THREAD_LIMIT=1 unless the caller sets it", () => {
  const t = tool('echo "TOTAL $OMP_THREAD_LIMIT.00"');
  try {
    assert.match(receiptTextFromFile(t.photo, { env: { RECEIPT_OCR_CMD: t.sh } }), /TOTAL 1\.00/);
    assert.match(receiptTextFromFile(t.photo, { env: { RECEIPT_OCR_CMD: t.sh, OMP_THREAD_LIMIT: "4" } }), /TOTAL 4\.00/);
  } finally { t.done(); }
});

test("a stalled OCR command is stopped at OCR_TIMEOUT with a message, not a hang", () => {
  const t = tool("sleep 30; echo TOTAL 9.99");
  try {
    const start = Date.now();
    assert.throws(() => receiptTextFromFile(t.photo, { env: { RECEIPT_OCR_CMD: t.sh, OCR_TIMEOUT: "0.5" } }),
      (e) => e.timedOut === true && /no reading within 0\.5 s/.test(e.message) && /OCR_TIMEOUT/.test(e.message));
    assert.ok(Date.now() - start < 10000, "stopped well before the command's 30 s");
  } finally { t.done(); }
});

test("a lead reading survives a tesseract that runs out of time", () => {
  const t = tool("sleep 30");
  try {
    const out = receiptPassesFromFile(t.photo, { env: { RECEIPT_OCR_CMD: t.sh, OCR_TIMEOUT: "0.3" }, lead: () => "SHOP\nTOTAL 12.50" });
    assert.deepEqual([...out], ["SHOP\nTOTAL 12.50"]);
  } finally { t.done(); }
});

test("a scanned statement page that stalls ends with the time-limit message", () => {
  const t = tool("sleep 30");
  try {
    assert.throws(() => readStatementFile(t.photo, { env: { STATEMENT_OCR_CMD: t.sh, OCR_TIMEOUT: "0.3" } }), /no reading within 0\.3 s/);
  } finally { t.done(); }
});

test("a timed-out tesseract pass stops the passes after it", () => {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push([cmd, ...args].join(" "));
    if (cmd === "tesseract" && args.includes("4")) { const error = new Error("t"); error.code = "ETIMEDOUT"; return { error, status: null, stdout: "" }; }
    if (cmd === "tesseract") return { status: 0, stdout: "TOTAL 5.00\n", stderr: "" };
    return { error: new Error("no imagemagick"), status: null, stdout: "" };
  };
  const out = receiptPassesFromFile("/x/slip.png", { run, env: {}, grow: 2000 });
  assert.equal(out.length, 1);
  assert.equal(calls.filter((c) => c.startsWith("tesseract")).length, 2);
});

test("OCR_TIMEOUT=0 turns the limit off; the default is two minutes", () => {
  assert.equal(ocrRunOptions({ OCR_TIMEOUT: "0" }).timeout, undefined);
  assert.equal(ocrRunOptions({}).timeout, OCR_TIMEOUT_S * 1000);
  assert.equal(ocrRunOptions({ OCR_TIMEOUT: "2.5" }).timeout, 2500);
});
