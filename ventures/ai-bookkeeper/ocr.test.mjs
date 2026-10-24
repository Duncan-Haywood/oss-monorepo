import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanOcr, receiptTextFromFile, statementTextFromFile } from "./ocr.mjs";
import { readStatement } from "./bank.mjs";
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

test("statement PDF: text goes through pdftotext, other files are read as they are", () => {
  const ok = (out) => () => ({ status: 0, stdout: out, stderr: "" });
  assert.equal(statementTextFromFile("s.pdf", { run: ok("x 1.00") }), "x 1.00");
  assert.throws(() => statementTextFromFile("s.pdf", { run: ok(" ") }), /no text layer/);
  assert.throws(() => statementTextFromFile("s.pdf", { run: () => ({ error: new Error("ENOENT") }) }), /poppler/);
});

// A one-page PDF written by hand (Courier text), read by the real pdftotext when it is installed.
function tinyPdf(lines) {
  const body = "BT /F1 9 Tf 40 760 Td 11 TL " + lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ") + " ET";
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return out;
}

test("a real statement PDF reads to the same rows as its pasted text", { skip: spawnSync("pdftotext", ["-v"]).error ? "pdftotext not installed" : false }, () => {
  const lines = ["Statement period 2026-09-01 to 2026-09-30", "Deposits", "2026-09-03 Client payment ACME 1,200.00", "Withdrawals",
    "2026-09-05 Office supplies Staples 45.20", "2026-09-12 Software subscription 19.99"];
  const f = join(mkdtempSync(join(tmpdir(), "stmt-")), "s.pdf");
  writeFileSync(f, tinyPdf(lines));
  const r = readStatement(statementTextFromFile(f));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-09-03", 120000], ["2026-09-05", -4520], ["2026-09-12", -1999]]);
});

test("cleanOcr leaves short mixed tokens and three-letter words next to digits alone", () => {
  assert.equal(cleanOcr("Size S1"), "Size S1");
  assert.equal(cleanOcr("Ref ATE1B234"), "Ref ATE1B234");
  assert.equal(cleanOcr("Qty 5 .500"), "Qty 5 .500");
  assert.equal(cleanOcr("Total 5 .50"), "Total 5.50");
});

test("a failed pdftotext is an error whatever way it fails, and its stderr is cut at 120", () => {
  const ok = { status: 0, stdout: "Total 5.00\n" };
  for (const read of [receiptTextFromFile, statementTextFromFile]) {
    assert.equal(read("a.pdf", { run: () => ok }), ok.stdout);
    assert.throws(() => read("a.pdf", { run: () => ({ status: 1, stdout: "x" }) }), /pdftotext/);
    assert.throws(() => read("a.pdf", { run: () => ({ status: 2, stdout: "x" }) }), /pdftotext/);
    assert.throws(() => read("a.pdf", { run: () => ({ status: 0, error: new Error("ENOENT"), stdout: "x" }) }), /pdftotext/);
    assert.throws(() => read("a.pdf", { run: () => ({ status: 0, stdout: "  \n" }) }), /no text layer/);
    const err = "e".repeat(300);
    const msg = (() => { try { read("a.pdf", { run: () => ({ status: 1, stderr: err }) }); } catch (e) { return e.message; } })();
    assert.ok(msg.includes("e".repeat(120)) && !msg.includes("e".repeat(121)));
  }
});
