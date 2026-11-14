// Scanned (image-only) statement PDFs and statement photos go through OCR
// (ocr.mjs readStatementFile); card statements' minus payments; the statement's own
// opening-to-closing check (statementtext.mjs). Stubbed tools, plus one real run
// through ImageMagick, pdftoppm and tesseract when they are installed.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStatementFile, statementTextFromFile, statementScore } from "./ocr.mjs";
import { readStatement } from "./bank.mjs";
import { readStatementText } from "./statementtext.mjs";

// pdftotext prints nothing (a scan); pdftoppm writes two pages; tesseract reads each
function stubs(pages, calls = []) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === "pdftotext") return { status: 0, stdout: "\n\f" };
    if (cmd === "pdftoppm") { const base = args[args.length - 1]; pages.forEach((_, i) => writeFileSync(`${base}-${i + 1}.png`, String(i))); return { status: 0, stdout: "" }; }
    if (cmd === "tesseract") return { status: 0, stdout: pages[+readFileSync(args[0], "utf8")] };
    return { error: new Error("ENOENT") };
  };
}

test("a PDF with no text layer is drawn page by page and read by OCR, pages in order", () => {
  const calls = [];
  const r = readStatementFile("scan.pdf", { run: stubs(["Statement period March 2026\n03/02 COFFEE 4.5O", "03/09 RENT 1,2OO.00"], calls), env: {} });
  assert.equal(r.ocr.pages, 2);
  assert.equal(r.ocr.tool, "tesseract");
  assert.equal(r.ocr.passes, 1); // no balance to check against, so one reading
  assert.match(r.text, /COFFEE 4\.50/); // digit look-alikes repaired
  assert.ok(r.text.indexOf("COFFEE") < r.text.indexOf("RENT"));
  assert.deepEqual(calls.find((c) => c[0] === "pdftoppm").slice(1, 5), ["-r", "300", "-gray", "-png"]);
  assert.ok(calls.find((c) => c[0] === "tesseract").includes("--psm"));
  assert.deepEqual(readStatement(r.text).rows.map((x) => [x.date, x.cents]), [["2026-03-02", -450], ["2026-03-09", -120000]]);
});

test("a reading that does not add up is read again as one column, and the one that adds up is kept", () => {
  const head = "Statement period March 2026\nBeginning Balance 1,000.00\nEnding Balance 1,240.00\n";
  const psm6 = head + "03/02 DEPOSIT 300.00 1,300.00\n03/05 FUEL 80.00 1,240.00\n"; // 60 misread as 80
  const psm4 = head + "03/02 DEPOSIT 300.00 1,300.00\n03/05 FUEL 60.00 1,240.00\n";
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: args.includes("4") ? psm4 : psm6 }; };
  const r = readStatementFile("page.png", { run, env: {} });
  assert.equal(calls.length, 2);
  assert.equal(r.ocr.passes, 2);
  assert.equal(r.ocr.chose, "--psm 4");
  assert.equal(r.ocr.score, 0);
  assert.match(r.text, /FUEL 60\.00/);
  // a reading that adds up the first time is not read again
  const once = [];
  readStatementFile("page.png", { run: (c, a) => { once.push(a); return { status: 0, stdout: psm4 }; }, env: {} });
  assert.equal(once.length, 1);
  // a custom OCR command is trusted as it is: one reading
  const custom = [];
  readStatementFile("page.png", { run: (c, a) => { custom.push(a); return { status: 0, stdout: psm6 }; }, env: { STATEMENT_OCR_CMD: "myocr {file}" } });
  assert.equal(custom.length, 1);
});

test("statementScore counts running-balance breaks and a missed closing balance; null with nothing to check", () => {
  const head = "Statement period March 2026\nBeginning Balance 1,000.00\nEnding Balance 1,240.00\n";
  assert.equal(statementScore(head + "03/02 DEPOSIT 300.00 1,300.00\n03/05 FUEL 60.00 1,240.00\n"), 0);
  assert.equal(statementScore(head + "03/02 DEPOSIT 300.00 1,300.00\n03/05 FUEL 80.00 1,240.00\n"), 0.5); // repaired from the balance: half a fault
  assert.equal(statementScore("Statement March 2026\n03/02 A 5.00\n03/03 B 6.00\n"), null);
});

test("a text-layer PDF is not OCR'd; a missing OCR tool says what to install", () => {
  const r = readStatementFile("s.pdf", { run: () => ({ status: 0, stdout: "03/01 A 1.00" }) });
  assert.equal(r.ocr, null);
  const noTess = (cmd, args) => (cmd === "tesseract" ? { error: new Error("ENOENT") } : stubs(["x"])(cmd, args));
  assert.throws(() => readStatementFile("scan.pdf", { run: noTess, env: {} }), /tesseract-ocr/);
  assert.throws(() => readStatementFile("scan.pdf", { run: (c) => (c === "pdftotext" ? { status: 0, stdout: "" } : { error: new Error("ENOENT") }), env: {} }), /pdftoppm/);
  assert.equal(statementTextFromFile("s.pdf", { run: () => ({ status: 0, stdout: "x 1.00" }) }), "x 1.00");
});

test("a photo of a statement page is read by OCR; STATEMENT_OCR_CMD replaces tesseract", () => {
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: "March 2026\n03/04 FUEL 4O.00\n" }; };
  const r = readStatementFile("page.jpg", { run, env: { STATEMENT_OCR_CMD: "myocr --lang eng {file}" } });
  assert.deepEqual(calls[0], ["myocr", "--lang", "eng", "page.jpg"]);
  assert.equal(r.ocr.tool, "myocr");
  assert.match(r.text, /FUEL 40\.00/);
});

test("card statement with minus payments and no headings: minus is a credit, bare rows are purchases", () => {
  const t = "Summit Rewards Card\nStatement period: Jul 1, 2026 through Jul 31, 2026\n07/01 07/02 PAYMENT THANK YOU -5,457.83\n07/03 07/04 FUEL STOP 19 251.21\n07/08 07/09 HOTEL HARBORVIEW 164.53\n";
  const r = readStatementText(t);
  assert.deepEqual(r.rows.map((x) => x.cents), [545783, -25121, -16453]);
  assert.match(r.inferred, /card statement/i);
  // a bank statement that prints withdrawals with a minus is unchanged
  const b = readStatementText("Business Checking March 2026\n03/01 RENT -1,000.00\n03/02 FEE -5.00\n03/03 DEPOSIT 300.00\n");
  assert.deepEqual(b.rows.map((x) => x.cents), [-100000, -500, -30000]);
  // the pasted-card fixture (headings) still reads as before
});

test("opening plus the rows must reach the closing balance; a misread digit shows as the gap", () => {
  const good = "Statement March 2026\nBeginning Balance $1,000.00\nEnding Balance $1,240.00\nDeposits and Additions\n03/02 DEPOSIT $300.00\nElectronic Withdrawals\n03/05 FUEL $60.00\n";
  assert.deepEqual(readStatementText(good).check, { opening: 100000, closing: 124000, rowsTotal: 24000, ok: true });
  const bad = good.replace("$60.00", "$80.00");
  const c = readStatementText(bad).check;
  assert.equal(c.ok, false);
  assert.equal(c.off, 2000);
});

const have = (c, a) => !spawnSync(c, a).error;
test("a real scan: an image-only PDF drawn by ImageMagick reads back through pdftoppm and tesseract",
  { skip: have("tesseract", ["--version"]) && have("pdftoppm", ["-v"]) && have("convert", ["-version"]) ? false : "tesseract, pdftoppm or ImageMagick not installed", timeout: 120000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    const lines = ["Riverbend Community Bank   Statement period March 1, 2026 to March 31, 2026", "Beginning Balance 2,000.00", "Ending Balance 3,138.75",
      "Date  Description               Amount    Balance", "03/02 MOBILE DEPOSIT            1,250.00  3,250.00", "03/09 CORNER HARDWARE #112        86.25  3,163.75", "03/17 BLUE DOOR COFFEE             25.00  3,138.75"];
    const png = join(dir, "s.png"), pdf = join(dir, "s.pdf");
    let m = spawnSync("convert", ["-size", "2400x700", "xc:white", "-font", "DejaVu-Sans-Mono", "-pointsize", "34", "-fill", "black", "-annotate", "+60+80", lines.join("\n"), "-rotate", "0.6", "-attenuate", "0.05", "+noise", "Gaussian", "-colorspace", "Gray", png]);
    if (m.status !== 0) m = spawnSync("convert", ["-size", "2400x700", "xc:white", "-pointsize", "34", "-fill", "black", "-annotate", "+60+80", lines.join("\n"), "-colorspace", "Gray", png]);
    assert.equal(m.status, 0, String(m.stderr));
    assert.equal(spawnSync("convert", [png, "-density", "200", "-units", "PixelsPerInch", pdf]).status, 0);
    const { text, ocr } = readStatementFile(pdf);
    assert.equal(ocr.pages, 1);
    const r = readStatement(text);
    assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-02", 125000], ["2026-03-09", -8625], ["2026-03-17", -2500]]);
  });

test("OCR repair: a misread amount is put back from a running balance the next line confirms", () => {
  const t = "Statement period: Sep 1, 2026 through Sep 30, 2026\nBeginning Balance 18,258.10\n09/22 SQUARE INC DEPOSIT 646.94 18,905.04\n09/24 ZELLE FROM J RIVERA 1,222.15 20,127.79\n09/25 DELI 44 MARKET 215.31 19,912.48\n";
  const plain = readStatementText(t);
  assert.equal(plain.repaired, undefined); // pasted text is never changed
  const r = readStatementText(t, { ocr: true });
  assert.deepEqual(r.rows.map((x) => x.cents), [64694, 122275, -21531]);
  assert.equal(r.repaired.length, 1);
  assert.equal(r.repaired[0].field, "amount");
  assert.match(r.problems.join(" "), /1,222\.15.*1,222\.75/);
});

test("OCR repair: a misread balance is put back when the next line chains from the amount", () => {
  const t = "Statement March 2026\nBeginning Balance 1,005.00\n03/01 COFFEE 5.00 1,000.00\n03/02 DEPOSIT 300.00 1,800.00\n03/05 FUEL 60.00 1,240.00\n";
  const r = readStatementText(t, { ocr: true });
  assert.deepEqual(r.rows.map((x) => [x.cents, x.balance]), [[-500, 100000], [30000, 130000], [-6000, 124000]]);
  assert.equal(r.repaired[0].field, "balance");
});

test("OCR repair: a row whose amount was lost (the balance read as the amount) gets it back", () => {
  const t = "Statement March 2026\nBeginning Balance 1,005.00\n03/01 COFFEE 5.00 1,000.00\n03/02 DEPOSIT 1.3e,00 1,300.00\n03/05 FUEL 60.00 1,240.00\n";
  const r = readStatementText(t, { ocr: true });
  assert.deepEqual(r.rows.map((x) => x.cents), [-500, 30000, -6000]);
});

test("OCR repair leaves a break it cannot settle from both sides, and a reading with no balances", () => {
  // the amount and both balances disagree: two faults in a row, no confirmation
  const t = "Statement March 2026\nBeginning Balance 1,000.00\n03/02 DEPOSIT 300.00 1,350.00\n03/05 FUEL 60.00 1,250.00\n";
  const r = readStatementText(t, { ocr: true });
  assert.equal(r.repaired, undefined);
  assert.equal(readStatementText("Statement March 2026\n03/02 A 5.00\n03/03 B 6.00\n", { ocr: true }).repaired, undefined);
});

test("a dated 'Balance brought forward' line is the opening balance, so the first row gets its sign", () => {
  const t = "Statement period: 1 Aug 2026 to 31 Aug 2026\n01 Aug Balance brought forward 11,663.15\n01 Aug DEPOSIT 1,248.96 12,912.11\n05 Aug FUEL 6.06 12,906.05\n";
  const r = readStatementText(t, { dayFirst: true });
  assert.deepEqual(r.rows.map((x) => x.cents), [124896, -606]);
  assert.equal(r.inferred, null);
});

test("a card statement's previous and new balance (owed, positive) check its rows", () => {
  const t = "Summit Rewards Card\nStatement period: Jul 1, 2026 through Jul 31, 2026\nPrevious Balance $1,000.00\nNew Balance $415.74\n07/01 07/02 PAYMENT THANK YOU -1,000.00\n07/03 07/04 FUEL STOP 19 251.21\n07/08 07/09 HOTEL HARBORVIEW 164.53\n";
  const c = readStatementText(t).check;
  assert.equal(c.ok, true);
  assert.equal(c.owed, true);
  const bad = readStatementText(t.replace("164.53", "184.53")).check;
  assert.equal(bad.ok, false);
  assert.equal(bad.off, -2000);
});

test("a summary line with both balances gives the opening and the closing; the first row is not repaired against the opening", () => {
  const t = "Statement period: Jan 1, 2026 through Jan 31, 2026\nBeginning balance 8,379.39 Ending balance 7,319.77\n01/08 CLOUD STORAGE PLAN 1,034.26 7,345.13\n01/10 DELI 44 MARKET 25.36 7,319.77\n";
  const r = readStatementText(t, { ocr: true });
  assert.deepEqual(r.check, { opening: 837939, closing: 731977, rowsTotal: -105962, ok: true });
  assert.deepEqual(r.rows.map((x) => x.cents), [-103426, -2536]);
  // opening misread: the first row is left alone (the balance check flags it)
  const m = readStatementText(t.replace("8,379.39", "8,879.39"), { ocr: true });
  assert.equal(m.repaired, undefined);
  assert.deepEqual(m.rows.map((x) => x.cents), [-103426, -2536]);
});
